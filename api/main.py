"""FastAPI entrypoint: CORS plus the two frozen contract routes from spec
section 6 — GET /health and POST /predict."""

import os

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from predict.interface import get_predictor, is_mock_mode
from schemas import HealthResponse, PredictionResponse

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024


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

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        """Liveness probe that also reports whether the mock predictor is active."""
        return HealthResponse(status="ok", mock=is_mock_mode())

    @app.post("/predict", response_model=PredictionResponse)
    async def predict(file: UploadFile) -> PredictionResponse:
        """Classify an uploaded building photo (jpeg/png/webp, max 10 MB)."""
        if file.content_type not in _ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Upload a JPEG, PNG, or WebP image.",
            )
        data = await file.read()
        if len(data) > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 10 MB.")
        prediction = get_predictor()(data)
        return PredictionResponse(
            level=prediction.level,
            confidence=prediction.confidence,
            probabilities=prediction.probabilities,
            heatmap_base64=prediction.heatmap_base64,
        )

    return app


app = create_app()
