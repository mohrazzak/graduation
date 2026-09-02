"""Ultralytics adapter for the yolov8m-seg four-class run.

Offered as a second, opt-in roster entry so the two training runs can be
compared in the product. It is NOT the serving model and should not be made
the default: the exported checkpoint stopped at epoch 2 of a 150-epoch
schedule, and on every comparable box metric it trails the yolov8s detector
(mAP50 0.204 vs 0.315, mAP50-95 0.127 vs 0.190, precision 0.157 vs 0.350).
Its top class also merges HVD and TD, which under most-severe-wins pushes
verdicts upward. See `SEG_MODEL_CLASS_NAMES` for the positional remap.

Its segmentation masks are deliberately not exposed: the /predict contract
carries boxes only, and a segment result populates `result.boxes` anyway.
"""

from __future__ import annotations

from predict.backends.ultralytics_detector import UltralyticsDetector
from predict.damage_classes import SEG_MODEL_CLASS_NAMES


class RaedSegClassifier(UltralyticsDetector):
    """The segmentation training run, served through the same box contract."""

    # Persisted in Supabase `model_id` and used for routing — never rename.
    id = "raed-seg"
    name = "Segmentation Model"
    accuracy: float | None = None
    weights_env = "RAED_SEG_WEIGHTS_PATH"
    threshold_env = "RAED_SEG_CONFIDENCE_THRESHOLD"
    expected_names = SEG_MODEL_CLASS_NAMES
