"""Pydantic response models for the frozen API contract (spec section 6)."""

from pydantic import BaseModel, Field


class PredictionResponse(BaseModel):
    """JSON body returned by POST /predict."""

    level: int = Field(ge=0, le=5)
    confidence: float = Field(ge=0, le=1)
    probabilities: list[float] = Field(min_length=6, max_length=6)
    heatmap_base64: str | None


class HealthResponse(BaseModel):
    """JSON body returned by GET /health."""

    status: str
    mock: bool
