"""FastAPI entrypoint: CORS plus the two frozen contract routes from spec
section 6 — GET /health and POST /predict."""

import io
import os

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image

from predict.interface import get_predictor, is_mock_mode
from schemas import HealthResponse, PredictionResponse

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
        """Liveness probe that also reports whether the mock predictor is active."""
        return HealthResponse(status="ok", mock=is_mock_mode())

    @app.post("/predict", response_model=PredictionResponse)
    async def predict(request: Request, file: UploadFile) -> PredictionResponse:
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
        prediction = get_predictor()(data)
        return PredictionResponse(
            level=prediction.level,
            confidence=prediction.confidence,
            probabilities=prediction.probabilities,
            heatmap_base64=prediction.heatmap_base64,
        )

    return app


app = create_app()
