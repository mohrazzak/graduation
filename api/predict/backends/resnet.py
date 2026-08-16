"""ResNet50 damage classifier (PHI-Net Task 5, Collapse Mode), 74.66% val acc.

Trained with Caffe-style preprocessing. Getting that pipeline wrong does not
raise — it yields confidently wrong tiers — so the steps below are exact and
tests/test_resnet.py pins them to a real measured prediction.
"""

from __future__ import annotations

import functools
import os
from io import BytesIO

from predict.interface import Prediction
from predict.registry import (
    REASON_DEPENDENCY_MISSING,
    REASON_LOAD_FAILED,
    REASON_WEIGHTS_MISSING,
    ModelUnavailableError,
)
from predict.tiers import damage_percent, probabilities_from_model, top_tier

DEFAULT_WEIGHTS = "/home/mohrazzak/projects/graduation/best_model.keras"

# ImageNet channel means, Caffe/VGG convention: subtracted in BGR order with NO
# division by standard deviation. These exact constants are what the model saw
# during training — changing them silently changes every verdict.
_MEAN_B = 103.939
_MEAN_G = 116.779
_MEAN_R = 123.68

_INPUT_SIZE = (224, 224)


@functools.lru_cache(maxsize=1)
def _load_model(path: str):  # noqa: ANN202 - returns a heavyweight keras Model
    """Load and cache the Keras model (seconds to load; never per request)."""
    import tensorflow as tf

    return tf.keras.models.load_model(path, compile=False)


class ResNetClassifier:
    """Keras ResNet50 transfer-learning classifier over the three tiers."""

    id = "resnet50-phinet"
    name = "ResNet50 (PHI-Net)"
    accuracy: float | None = 0.7466

    def __init__(self) -> None:
        path = os.environ.get("RESNET_WEIGHTS_PATH", DEFAULT_WEIGHTS).strip()
        if not path or not os.path.exists(path):
            raise ModelUnavailableError(self.id, REASON_WEIGHTS_MISSING)
        try:
            import tensorflow  # noqa: F401
        except ImportError as exc:
            raise ModelUnavailableError(self.id, REASON_DEPENDENCY_MISSING) from exc
        try:
            _load_model(path)
        except Exception as exc:  # noqa: BLE001 - any load failure means "unavailable"
            raise ModelUnavailableError(self.id, REASON_LOAD_FAILED) from exc
        self._path = path

    def classify(self, image_bytes: bytes) -> Prediction:
        """Classify a building photo into a damage tier."""
        import numpy as np
        from PIL import Image

        image = Image.open(BytesIO(image_bytes)).convert("RGB").resize(_INPUT_SIZE)
        array = np.array(image).astype(np.float32)
        array = array[..., ::-1]  # RGB -> BGR
        array[..., 0] -= _MEAN_B
        array[..., 1] -= _MEAN_G
        array[..., 2] -= _MEAN_R

        vector = _load_model(self._path).predict(
            np.expand_dims(array, axis=0), verbose=0
        )[0]

        # The model emits GC, NC, PC alphabetically — convert at this boundary
        # so nothing above ever sees a class index.
        probabilities = probabilities_from_model(vector.tolist())
        tier = top_tier(probabilities)
        return Prediction(
            tier=tier,
            confidence=probabilities[tier],
            probabilities=probabilities,
            damage_percent=damage_percent(probabilities),
            heatmap_base64=None,
        )
