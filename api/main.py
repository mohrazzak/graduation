"""FastAPI entrypoint: CORS plus the tier-based contract routes from the
restore-pipeline spec section 4 — GET /health, GET /models, POST /predict."""

import io
import os

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image

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

        prediction = classifier.classify(data)
        return PredictionResponse(
            tier=prediction.tier,
            confidence=prediction.confidence,
            probabilities=prediction.probabilities,
            damage_percent=prediction.damage_percent,
            model=ModelInfoResponse(
                id=classifier.id,
                name=classifier.name,
                accuracy=classifier.accuracy,
            ),
            heatmap_base64=prediction.heatmap_base64,
        )

    return app


app = create_app()
