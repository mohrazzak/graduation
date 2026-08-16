"""Pydantic response models for the tier-based API contract (spec section 4)."""

from pydantic import BaseModel, ConfigDict, Field

from predict.tiers import TierCode


class ModelInfoResponse(BaseModel):
    """One entry in GET /models, and the `model` block on POST /predict."""

    id: str
    name: str
    accuracy: float | None = Field(default=None, ge=0, le=1)
    available: bool = True
    reason: str | None = None


class ModelsResponse(BaseModel):
    """JSON body returned by GET /models."""

    models: list[ModelInfoResponse]


class PredictionResponse(BaseModel):
    """JSON body returned by POST /predict.

    Probabilities are keyed by tier CODE, never by index — the models emit
    classes alphabetically while the product reasons by severity, so an indexed
    wire format is the one shape that invites silent mislabeling.
    """

    # "model_" is a protected namespace in pydantic v2; this response genuinely
    # has a field called `model`, so the protection is switched off here.
    model_config = ConfigDict(protected_namespaces=())

    tier: TierCode
    confidence: float = Field(ge=0, le=1)
    probabilities: dict[TierCode, float]
    damage_percent: float = Field(ge=0, le=100)
    model: ModelInfoResponse
    heatmap_base64: str | None = None


class HealthResponse(BaseModel):
    """JSON body returned by GET /health."""

    model_config = ConfigDict(protected_namespaces=())

    status: str
    mock: bool
    model: str
