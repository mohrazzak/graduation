"""Pydantic response models for the active four-class detector contract."""

from pydantic import BaseModel, ConfigDict, Field

from predict.damage_classes import DamageCode


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


class BoxResponse(BaseModel):
    """Normalized `xyxy` bounds for one detected building."""

    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)
    x2: float = Field(ge=0, le=1)
    y2: float = Field(ge=0, le=1)


class DetectionResponse(BaseModel):
    """One building detection returned by Raed's model."""

    class_code: DamageCode
    confidence: float = Field(ge=0, le=1)
    box: BoxResponse


class PredictionResponse(BaseModel):
    """JSON body returned by POST /predict.

    Scores are maximum observed detector confidences per class, not fabricated
    probabilities and therefore are not required to sum to one.
    """

    # "model_" is a protected namespace in pydantic v2; this response genuinely
    # has a field called `model`, so the protection is switched off here.
    model_config = ConfigDict(protected_namespaces=())

    class_code: DamageCode
    confidence: float = Field(ge=0, le=1)
    scores: dict[DamageCode, float]
    detections: list[DetectionResponse]
    model: ModelInfoResponse


class HealthResponse(BaseModel):
    """JSON body returned by GET /health."""

    model_config = ConfigDict(protected_namespaces=())

    status: str
    mock: bool
    model: str
