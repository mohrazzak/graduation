# Pre-generated fixtures

These are REAL outputs of the pipeline, generated ahead of time and committed so
the demo still has something to show when a generation service is out of credit.

They are not live results. Every surface that displays one labels it as a
pre-generated example — see `lib/fixtures.ts` and the `fixture` message keys.

| File | Source | Produced by | When |
| ---- | ------ | ----------- | ---- |
| `sample-NC.glb` | `public/samples/sample-NC.jpg` | Tripo AI `image_to_model` v2.5, texture + PBR | 2026-08-17 |

`sample-NC.glb`: glTF v2, 9.36 MB, 1 mesh, 158,133 vertices, PBR material with
baseColor + metallicRoughness textures.

Restoration (2D) fixtures are still missing — the Gemini free-tier image quota
has been exhausted every time it was probed. Generate them when it resets.
