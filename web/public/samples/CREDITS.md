# Sample image credits

`sample-NC.jpg`, `sample-PC.jpg`, `sample-GC.jpg` come from the **PHI-Net**
dataset (Task 5, Collapse Mode) published by the Pacific Earthquake Engineering
Research Center (PEER), UC Berkeley. They are validation-split images, resized
and re-encoded for the web.

Each one was chosen by scoring every validation image of its class with the
ResNet50 classifier and keeping the one it classifies **correctly** with the
highest confidence, so a demo sample never contradicts the model:

| File | Class | Model confidence |
| ---- | ----- | ---------------- |
| sample-NC.jpg | Non-collapse | 96.6% |
| sample-PC.jpg | Partial collapse | 72.0% |
| sample-GC.jpg | Global collapse | 98.8% |

Cite PHI-Net when publishing results derived from these images.
