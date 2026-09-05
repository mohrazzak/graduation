# Pre-generated fixtures

These are REAL outputs of the pipeline, generated ahead of time and committed so
the demo still has something to show when a generation service is out of credit.

They are not live results. Every surface that displays one labels it as a
pre-generated example — see `lib/fixtures.ts` and the `fixtureNotice` message.

Regenerate with: `python3 scripts/make_fixtures.py [--force]`

## 3D reconstruction — Tripo AI `image_to_model` v2.5, texture + PBR, 2026-08-17

| File | Source | Size | Geometry |
| ---- | ------ | ---- | -------- |
| `sample-ND.glb` | `public/samples/sample-ND.jpg` | 9.36 MB | 158,133 verts |
| `sample-TD.glb` | `public/samples/sample-TD.jpg` | 16.45 MB | 299,741 verts |

Renamed from `sample-NC.glb` / `sample-GC.glb` when the sample strip moved to
the four-class scale. The source images are byte-identical, so each model still
depicts exactly the photo it is offered for. The former `sample-PC.glb` was
dropped: under the active detector its source image returns `no_detection`, so
the 3D step is unreachable from it. The SMD and HVD samples have no
pre-generated model — they show the honest out-of-credit state instead.

## 2D restoration — MISSING

Not generated yet: the Gemini free-tier image quota has been exhausted on every
attempt. `scripts/make_fixtures.py` writes `sample-<CODE>-repaired.png` here as
soon as the quota resets, and skips cleanly (never writes a placeholder) while
it is spent.
