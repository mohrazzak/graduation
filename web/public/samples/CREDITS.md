# Sample image credits

Every `sample-*.jpg` here comes from the **PHI-Net** dataset (Task 5, Collapse
Mode) published by the Pacific Earthquake Engineering Research Center (PEER),
UC Berkeley. They are validation-split images, resized and re-encoded for the
web. Cite PHI-Net when publishing results derived from them.

## Active four-class samples

One per class of the scale the Trained Model actually predicts over. Each was
picked by scoring the validation split with the detector itself and keeping an
image it classifies **correctly**, so a demo sample never contradicts the model.

| File | Class | Detector verdict |
| ---- | ----- | ---------------- |
| `sample-ND.jpg` | No Damage | ND 63.9% |
| `sample-SMD.jpg` | Slight / Moderate Damage | SMD 64.2% |
| `sample-HVD.jpg` | Heavy / Very Heavy Damage | HVD 53.7% |
| `sample-TD.jpg` | Total Damage | TD 57.6% |

These are detector confidences, not normalized probabilities.

`sample-ND.jpg` and `sample-TD.jpg` are byte-identical to the legacy
`sample-NC.jpg` and `sample-GC.jpg`, which is what keeps their committed 3D
fixtures truthful. `sample-HVD.jpg` is cropped to 224x192 to remove a press
watermark along the bottom edge; the crop raised detector confidence from
0.483 to 0.537, so it costs the demo nothing.

## Legacy three-tier samples

`sample-NC.jpg`, `sample-PC.jpg` and `sample-GC.jpg` are retained because the
legacy ResNet and YOLO-cls backend tests load them as fixtures. They are no
longer offered in the analyze sample strip. Under the active four-class
detector `sample-PC.jpg` returns `no_detection`.

| File | Legacy class | ResNet50 confidence |
| ---- | ------------ | ------------------- |
| `sample-NC.jpg` | Non-collapse | 96.6% |
| `sample-PC.jpg` | Partial collapse | 72.0% |
| `sample-GC.jpg` | Global collapse | 98.8% |
