"""Raed's classifier — registered now, loadable when his weights arrive.

Ships as a real roster entry rather than a future TODO, so the picker shows it
(disabled, with a reason) from day one. When the weights land, set
RAED_WEIGHTS_PATH; if his architecture is not Keras, replace classify() and
nothing else in the system changes.
"""

from __future__ import annotations

import os

from predict.interface import Prediction
from predict.registry import REASON_WEIGHTS_MISSING, ModelUnavailableError


class RaedClassifier:
    """Placeholder backend that refuses to load until weights exist."""

    id = "raed"
    name = "Raed's model"
    accuracy: float | None = None

    def __init__(self) -> None:
        path = os.environ.get("RAED_WEIGHTS_PATH", "").strip()
        if not path or not os.path.exists(path):
            raise ModelUnavailableError(self.id, REASON_WEIGHTS_MISSING)
        self._path = path

    def classify(self, image_bytes: bytes) -> Prediction:
        """Classify a building photo with Raed's model.

        Raises:
            NotImplementedError: until his architecture and preprocessing are
                known. Reaching here means the weights exist but the inference
                adapter was never written — fail loudly rather than return a
                tier nobody computed.
        """
        raise NotImplementedError(
            "Raed's weights are present but the inference adapter is not written yet."
        )
