"""Placeholder for the trained model — same predict() contract as the mock so
it slots in via MOCK_MODE=false with zero frontend change."""

from predict.interface import Prediction


def predict(data: bytes) -> Prediction:
    """Classify building damage with the trained CNN (not implemented yet).

    Future contract (spec section 6): run the trained classifier on the image
    bytes, compute a Grad-CAM heatmap (pytorch-grad-cam for PyTorch or
    tf-keras-vis for TF/Keras), overlay it on the input at 40-50% opacity,
    and return a Prediction with level (argmax), confidence, the six class
    probabilities, and the overlay as base64 PNG — exactly the shape the
    mock returns today.
    """
    raise NotImplementedError("Real model is not trained yet; run with MOCK_MODE=true.")
