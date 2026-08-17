# Pre-generated fixtures

These are REAL outputs of the pipeline, generated ahead of time and committed so
the demo still has something to show when a generation service is out of credit.

They are not live results. Every surface that displays one labels it as a
pre-generated example — see `lib/fixtures.ts` and the `fixtureNotice` message.

Regenerate with: `python3 scripts/make_fixtures.py [--force]`

## 3D reconstruction — Tripo AI `image_to_model` v2.5, texture + PBR, 2026-08-17

| File | Source | Size | Geometry |
| ---- | ------ | ---- | -------- |
| `sample-NC.glb` | `public/samples/sample-NC.jpg` | 9.36 MB | 158,133 verts |
| `sample-PC.glb` | `public/samples/sample-PC.jpg` | 15.69 MB | 276,982 verts |
| `sample-GC.glb` | `public/samples/sample-GC.jpg` | 16.45 MB | 299,741 verts |

## 2D restoration — MISSING

Not generated yet: the Gemini free-tier image quota has been exhausted on every
attempt. `scripts/make_fixtures.py` writes `sample-<TIER>-repaired.png` here as
soon as the quota resets, and skips cleanly (never writes a placeholder) while
it is spent.
