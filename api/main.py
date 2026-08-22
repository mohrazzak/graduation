"""FastAPI entrypoint: CORS plus the tier-based contract routes from the
restore-pipeline spec — GET /health, GET /models, POST /predict, and the
polled job routes for restoration and 3D reconstruction."""

import io
import os
import threading

from fastapi import FastAPI, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from PIL import Image

from jobs import mask as mask_job
from jobs import model3d, repair
from jobs.store import store as job_store
from predict.damage_classes import DAMAGE_CLASS_ORDER, NoDetectionError
from predict.registry import (
    ModelUnavailableError,
    UnknownModelError,
    default_model_id,
    get_classifier,
    list_models,
)
from schemas import (
    HealthResponse,
    ModelInfoResponse,
    ModelsResponse,
    PredictionResponse,
)

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
_TOO_LARGE_DETAIL = "File too large. Maximum size is 10 MB."


def create_app() -> FastAPI:
    """Build the FastAPI app (factory keeps tests and uvicorn on the same path)."""
    app = FastAPI(title="DamageScale API")
    origins = [
        origin.strip()
        for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST"],
        allow_headers=["content-type"],
    )

    @app.exception_handler(RequestValidationError)
    async def on_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        """Map request-shape errors (e.g. missing 'file' field) to the contract.

        Spec section 6 fixes ALL client errors at 400 {"detail": "..."}; without
        this handler FastAPI would answer 422 with its own error format.
        """
        return JSONResponse(
            status_code=400,
            content={"detail": "Invalid request. Send the image as multipart form field 'file'."},
        )

    @app.exception_handler(Exception)
    async def on_unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        """Convert unhandled errors (e.g. a crashing predictor) to contract JSON.

        Spec section 6: 500 returns {"detail": "..."} — a generic message, never
        a stack trace or exception text that could leak internals.
        """
        return JSONResponse(
            status_code=500,
            content={"detail": "The analysis failed unexpectedly. Retry with the same photo."},
        )

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        """Liveness probe that also reports which classifier is active."""
        active = default_model_id()
        return HealthResponse(status="ok", mock=active == "mock", model=active)

    @app.get("/models", response_model=ModelsResponse)
    def models() -> ModelsResponse:
        """List the enabled classifier backends and whether each can run now.

        Unavailable backends are reported with a reason rather than omitted: a
        disabled entry is information, a missing one is a mystery.
        """
        return ModelsResponse(
            models=[
                ModelInfoResponse(
                    id=info.id,
                    name=info.name,
                    accuracy=info.accuracy,
                    available=info.available,
                    reason=info.reason,
                )
                for info in list_models()
            ]
        )

    @app.post("/predict", response_model=PredictionResponse)
    async def predict(
        request: Request, file: UploadFile, model: str | None = None
    ) -> PredictionResponse:
        """Classify an uploaded building photo (jpeg/png/webp, max 10 MB)."""
        if file.content_type not in _ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Upload a JPEG, PNG, or WebP image.",
            )
        # WHY precheck Content-Length: reject declared-oversize requests before
        # pulling the upload into memory. The post-read check below still covers
        # chunked requests that carry no Content-Length header.
        declared_size = request.headers.get("content-length", "")
        if declared_size.isdigit() and int(declared_size) > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail=_TOO_LARGE_DETAIL)
        data = await file.read()
        if len(data) > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail=_TOO_LARGE_DETAIL)
        # WHY verify with Pillow: Content-Type is caller-controlled, so this is
        # the defense against mislabeled uploads. verify() reads a throwaway
        # stream — the predictor still receives the ORIGINAL bytes, keeping the
        # hash-seeded mock fully deterministic.
        try:
            Image.open(io.BytesIO(data)).verify()
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail="The file is not a valid image. Upload a real JPEG, PNG, or WebP photo.",
            ) from exc
        try:
            classifier = get_classifier(model)
        except UnknownModelError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown model {model!r}. Call GET /models for the roster.",
            ) from exc
        except ModelUnavailableError as exc:
            # 503, not 500: the request was valid, the server just cannot serve
            # that model right now (missing weights or dependency).
            raise HTTPException(
                status_code=503,
                detail="That model is not available on this server right now.",
            ) from exc

        try:
            prediction = classifier.classify(data)
        except NoDetectionError as exc:
            raise HTTPException(status_code=422, detail="no_detection") from exc
        return PredictionResponse(
            class_code=prediction.class_code,
            confidence=prediction.confidence,
            scores=prediction.scores,
            detections=[
                {
                    "class_code": detection.class_code,
                    "confidence": detection.confidence,
                    "box": {
                        "x1": detection.box.x1,
                        "y1": detection.box.y1,
                        "x2": detection.box.x2,
                        "y2": detection.box.y2,
                    },
                }
                for detection in prediction.detections
            ],
            model=ModelInfoResponse(
                id=classifier.id,
                name=classifier.name,
                accuracy=classifier.accuracy,
            ),
        )

    # ---- Long-running services: restoration and 3D reconstruction ----------
    # Both take far longer than a browser request tolerates, so both are jobs
    # the client polls. Polling (not SSE) matches Tripo's own pattern, holds no
    # connection open, and survives a sleeping free-tier dyno.

    async def _read_upload(request: Request, file: UploadFile) -> bytes:
        """Validate an uploaded image and return its bytes (shared with /predict)."""
        if file.content_type not in _ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Upload a JPEG, PNG, or WebP image.",
            )
        declared_size = request.headers.get("content-length", "")
        if declared_size.isdigit() and int(declared_size) > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail=_TOO_LARGE_DETAIL)
        data = await file.read()
        if len(data) > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail=_TOO_LARGE_DETAIL)
        try:
            Image.open(io.BytesIO(data)).verify()
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail="The file is not a valid image. Upload a real JPEG, PNG, or WebP photo.",
            ) from exc
        return data

    @app.post("/jobs/mask")
    async def start_mask(request: Request, file: UploadFile) -> dict[str, str]:
        """Prepare an automatic building mask for browser-side editing."""
        data = await _read_upload(request, file)
        job = job_store.create("mask", stage_total=len(mask_job.STAGE_KEYS))
        threading.Thread(target=mask_job.run, args=(job.id, data), daemon=True).start()
        return {"job_id": job.id}

    @app.post("/jobs/repair")
    async def start_repair(
        request: Request,
        file: UploadFile,
        mask: UploadFile,
        class_code: str = Form(...),
        prompt: str | None = Form(None),
    ) -> dict[str, str]:
        """Start selective 2D restoration through the submitted mask only."""
        if class_code not in DAMAGE_CLASS_ORDER:
            raise HTTPException(
                status_code=400,
                detail=(
                    "A valid class_code (ND, SMD, HVD or TD) is required. "
                    "Classify the photo first."
                ),
            )
        data = await _read_upload(request, file)
        if mask.content_type != "image/png":
            raise HTTPException(status_code=400, detail="invalid_mask")
        mask_bytes = await mask.read()
        if not mask_bytes or len(mask_bytes) > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="invalid_mask")
        source_size = Image.open(io.BytesIO(data)).size
        try:
            selection = repair.decode_selection_mask(mask_bytes, source_size)
        except repair.MaskValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.reason) from exc
        job = job_store.create("repair", stage_total=len(repair.STAGE_KEYS))
        threading.Thread(
            target=repair.run,
            args=(job.id, data, selection, class_code, prompt),
            daemon=True,
        ).start()
        return {"job_id": job.id}

    @app.post("/jobs/model3d")
    async def start_model3d(
        request: Request,
        file: UploadFile | None = None,
        from_job: str | None = Form(None),
    ) -> dict[str, str]:
        """Start a 3D reconstruction job, from an upload or a finished repair."""
        if from_job:
            data = repair.repaired_bytes(from_job)
            if data is None:
                raise HTTPException(
                    status_code=400,
                    detail="That restoration job has no finished image to reconstruct.",
                )
        elif file is not None:
            data = await _read_upload(request, file)
        else:
            raise HTTPException(
                status_code=400, detail="Provide either a file or from_job."
            )
        job = job_store.create("model3d", stage_total=len(model3d.STAGE_KEYS))
        threading.Thread(target=model3d.run, args=(job.id, data), daemon=True).start()
        return {"job_id": job.id}

    @app.get("/jobs/{job_id}")
    def job_status(job_id: str) -> dict[str, object]:
        """Poll a job: status, the stage it genuinely reached, ready artifacts."""
        job = job_store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Unknown or expired job.")
        return job.to_status()

    @app.get("/jobs/{job_id}/artifact/{name}")
    def job_artifact(job_id: str, name: str) -> Response:
        """Fetch one artifact's raw bytes (mask, edges, repaired, diff, model)."""
        job = job_store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Unknown or expired job.")
        artifact = job.artifacts.get(name)
        if artifact is None:
            raise HTTPException(status_code=404, detail="No such artifact on this job.")
        return Response(content=artifact.data, media_type=artifact.content_type)

    return app


app = create_app()
