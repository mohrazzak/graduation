# Restore Pipeline — Phase 1: Three tiers + real classifiers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six-level mock damage scale with the three PHI-Net collapse
tiers emitted by the real trained classifiers, behind a pluggable model registry.

**Architecture:** A tier domain module owns the scale and the alphabetical→code
conversion that prevents mislabeling. A registry exposes named classifier
backends (`resnet50-phinet`, `yolo-cls`, `raed`, `mock`) selected per request.
The API stops speaking in numeric indices entirely — responses carry tier codes,
so the ordering bug becomes unwriteable. The web app migrates `levels.ts` →
`tiers.ts` and follows.

**Tech Stack:** FastAPI + Pydantic v2 (Python 3.12), TensorFlow 2.21 (Keras
ResNet50), Ultralytics 8.4 + torch 2.12 (YOLO11-cls), Next.js 16 App Router +
TypeScript strict, next-intl, Tailwind v4, Supabase.

Implements phases 1–2 and §5 of
[`docs/superpowers/specs/2026-08-17-restore-pipeline-design.md`](../specs/2026-08-17-restore-pipeline-design.md).
Phases 3–4 (job API, Gemini repair, Tripo 3D, model-viewer) get their own plans.

## Global Constraints

- **TypeScript strict, zero `any`.** `npx tsc --noEmit` must pass with 0 errors.
- **Python: type hints everywhere, ruff-clean, docstrings on public functions.**
- **Components < ~150 lines, named export, explicit props interface.** Server
  Components by default; `"use client"` only when needed.
- **Zero hardcoded UI strings in JSX.** Everything through `messages/{en,ar}.json`
  via next-intl. Numbers/percentages through next-intl formatters.
- **Tailwind logical properties only:** `ms- me- ps- pe- text-start text-end
  start- end-`. NEVER `ml- mr- pl- pr- left- right-`.
- **Supabase only via `lib/supabase/`; FastAPI only via `lib/api.ts`.** Never
  inside JSX components.
- **No magic values.** Tier codes, colors, and labels come from `lib/tiers.ts`
  (web) and `predict/tiers.py` (api). Nowhere else.
- **`prefers-reduced-motion` gates every animation** (framer-motion
  `useReducedMotion` + CSS media query).
- **Palette (unchanged):** `bg #0C0C0E`, `surface #161619`, `line #2A2A2F`,
  `text #EDEDEF`, `muted #8B8B93`, `hazard #FFB000`, `alert #FF3B30`.
- **Tier colors:** `NC #22C55E`, `PC #F97316`, `GC #991B1B`. The `alert` color
  and the hazard stripe are **GC-only**.
- **`alert`/hazard-stripe is reserved** — never applied to NC or PC.
- **Border radius ≤ 4px**, hairline `line` borders, no gradients, no glassmorphism.
- **Fonts:** Archivo (display), Inter (body), JetBrains Mono (ALL numbers,
  percentages, timestamps, tier codes), Cairo (ar).
- **Copy voice:** technical inspection register, short.
- **`NC` is never labelled "intact".** PHI-Net defines it as "intact **or minor
  damage**, structure remains." EN label "Non-collapse", AR "لا انهيار".
- **⚠ `import torch` must happen before any TensorFlow import** or the process
  segfaults. See Task 2.

---

## File Structure

**API — new:**
- `api/predict/tiers.py` — the scale, weights, alphabetical→code conversion
- `api/predict/registry.py` — `Classifier` protocol, roster, `ENABLED_MODELS`
- `api/predict/backends/__init__.py`
- `api/predict/backends/mock_backend.py` — deterministic, hash-seeded
- `api/predict/backends/resnet.py` — Keras ResNet50
- `api/predict/backends/yolo.py` — Ultralytics YOLO11-cls
- `api/predict/backends/raed.py` — stub until weights arrive
- `api/requirements-models.txt` — heavy optional deps
- `api/tests/test_tiers.py`, `api/tests/test_registry.py`, `api/tests/test_models_route.py`

**API — modified:**
- `api/predict/interface.py` — `Prediction` becomes tier-based
- `api/schemas.py` — new response models
- `api/main.py` — `/predict` rewrite, new `/models`, `/health` gains model id
- `api/tests/test_api.py` — contract tests updated

**API — deleted:** `api/predict/mock.py`, `api/predict/model.py` (replaced by backends/)

**Web — new:**
- `web/lib/tiers.ts` — single source of truth (replaces `levels.ts`)
- `web/components/ui/TierStrip.tsx` — 3-segment motif (replaces `ScaleStrip`)
- `web/components/analyze/DamageGauge.tsx`
- `web/components/analyze/RecommendationCard.tsx`
- `web/components/analyze/ModelPicker.tsx`

**Web — modified:** `lib/types.ts`, `lib/api.ts`, `lib/supabase/queries.ts`,
result/history/how-it-works/report components, `messages/{en,ar}.json`

**Web — deleted:** `web/lib/levels.ts`, `web/components/ui/ScaleStrip.tsx`

**Data:** `supabase/schema.sql` + `supabase/migrations/2026-08-17-tiers.sql`

---

## Task 1: Tier domain module

The scale, the damage formula, and the one conversion that stops every
downstream mislabeling. Everything else in the plan depends on this.

**Files:**
- Create: `api/predict/tiers.py`
- Test: `api/tests/test_tiers.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `TierCode = Literal["NC", "PC", "GC"]`
  - `TIER_ORDER: tuple[TierCode, ...]` — severity order `("NC","PC","GC")`
  - `MODEL_CLASS_ORDER: tuple[TierCode, ...]` — alphabetical `("GC","NC","PC")`
  - `DAMAGE_WEIGHT: dict[TierCode, float]`
  - `probabilities_from_model(vector: Sequence[float]) -> dict[TierCode, float]`
  - `probabilities_from_names(names: Mapping[int, str], vector: Sequence[float]) -> dict[TierCode, float]`
  - `top_tier(probabilities: Mapping[TierCode, float]) -> TierCode`
  - `damage_percent(probabilities: Mapping[TierCode, float]) -> float`

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_tiers.py`:

```python
"""The tier scale, and the alphabetical-order trap it exists to prevent."""

import pytest

from predict.tiers import (
    DAMAGE_WEIGHT,
    MODEL_CLASS_ORDER,
    TIER_ORDER,
    damage_percent,
    probabilities_from_model,
    probabilities_from_names,
    top_tier,
)

# The real ResNet output for demo/damaged/partial.jpg, measured 2026-08-17.
# Alphabetical order: GC, NC, PC.
REAL_VECTOR = [0.2213, 0.1784, 0.6003]


def test_model_order_differs_from_severity_order():
    """The whole reason this module exists — if these ever match, delete it."""
    assert MODEL_CLASS_ORDER == ("GC", "NC", "PC")
    assert TIER_ORDER == ("NC", "PC", "GC")
    assert MODEL_CLASS_ORDER != TIER_ORDER


def test_probabilities_from_model_maps_alphabetically():
    probs = probabilities_from_model(REAL_VECTOR)
    assert probs == {"GC": 0.2213, "NC": 0.1784, "PC": 0.6003}


def test_probabilities_from_model_rejects_wrong_length():
    with pytest.raises(ValueError, match="3 values"):
        probabilities_from_model([0.5, 0.5])


def test_top_tier_picks_the_highest_not_the_first():
    assert top_tier(probabilities_from_model(REAL_VECTOR)) == "PC"


def test_top_tier_would_be_wrong_if_indices_were_trusted():
    """Guards the actual bug: naive argmax on a severity-ordered assumption."""
    probs = probabilities_from_model(REAL_VECTOR)
    naive = TIER_ORDER[REAL_VECTOR.index(max(REAL_VECTOR))]
    assert naive == "GC"          # what the bug would produce
    assert top_tier(probs) == "PC"  # what is correct


def test_damage_percent_is_the_weighted_expectation():
    probs = probabilities_from_model(REAL_VECTOR)
    expected = 0.2213 * 95 + 0.1784 * 15 + 0.6003 * 60
    assert damage_percent(probs) == pytest.approx(expected, abs=1e-6)


def test_damage_percent_bounds_match_the_weights():
    assert damage_percent({"NC": 1.0, "PC": 0.0, "GC": 0.0}) == pytest.approx(15.0)
    assert damage_percent({"NC": 0.0, "PC": 0.0, "GC": 1.0}) == pytest.approx(95.0)


def test_probabilities_from_names_uses_the_models_own_labels():
    """Ultralytics reports names; trust those over positional assumptions."""
    names = {0: "GC", 1: "NC", 2: "PC"}
    assert probabilities_from_names(names, [0.1, 0.7, 0.2]) == {
        "GC": 0.1, "NC": 0.7, "PC": 0.2,
    }


def test_probabilities_from_names_rejects_a_missing_tier():
    with pytest.raises(ValueError, match="NC"):
        probabilities_from_names({0: "GC", 1: "PC"}, [0.4, 0.6])


def test_weights_cover_every_tier():
    assert set(DAMAGE_WEIGHT) == set(TIER_ORDER)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && .venv/bin/pytest tests/test_tiers.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'predict.tiers'`

- [ ] **Step 3: Write the implementation**

Create `api/predict/tiers.py`:

```python
"""The three-tier damage scale (PHI-Net Task 5, Collapse Mode).

The single source of truth for the scale, and — more importantly — the only
place that knows models emit classes in ALPHABETICAL order while the product
reasons in SEVERITY order. Converting at this boundary and passing tier codes
everywhere above it makes the mislabeling bug impossible to write.

NC is "non-collapse", NOT "intact": PHI-Net defines it as "intact or minor
damage, structure remains". Never label it as undamaged.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Literal, get_args

TierCode = Literal["NC", "PC", "GC"]

# Severity order. Everything user-facing iterates this.
TIER_ORDER: tuple[TierCode, ...] = get_args(TierCode)

# The order Keras and Ultralytics emit classes in: alphabetical, not severity.
# This constant is the trap, isolated so it can only be misread in one file.
MODEL_CLASS_ORDER: tuple[TierCode, ...] = ("GC", "NC", "PC")

# Damage-percentage weights (PHI-Net prototype formula). A weighted expectation
# over class probabilities — a planning signal, never a measured quantity.
DAMAGE_WEIGHT: dict[TierCode, float] = {"NC": 15.0, "PC": 60.0, "GC": 95.0}


def probabilities_from_model(vector: Sequence[float]) -> dict[TierCode, float]:
    """Map an alphabetically-ordered model output onto tier codes.

    Args:
        vector: softmax output in MODEL_CLASS_ORDER (GC, NC, PC).

    Returns:
        Probability per tier code.

    Raises:
        ValueError: if the vector is not exactly three values.
    """
    if len(vector) != len(MODEL_CLASS_ORDER):
        raise ValueError(
            f"expected 3 values in {MODEL_CLASS_ORDER} order, got {len(vector)}"
        )
    return {
        code: float(value)
        for code, value in zip(MODEL_CLASS_ORDER, vector, strict=True)
    }


def probabilities_from_names(
    names: Mapping[int, str], vector: Sequence[float]
) -> dict[TierCode, float]:
    """Map a model output using the model's OWN class-name table.

    Preferred over positional mapping whenever the framework reports names
    (Ultralytics does), because it survives a retrain that reorders classes.

    Raises:
        ValueError: if the model does not cover all three tiers.
    """
    by_code = {
        str(names[index]).upper(): float(value)
        for index, value in enumerate(vector)
        if index in names
    }
    missing = [code for code in TIER_ORDER if code not in by_code]
    if missing:
        raise ValueError(
            f"model does not emit tier(s) {', '.join(missing)}; "
            f"it reports classes {sorted(by_code)}"
        )
    return {code: by_code[code] for code in MODEL_CLASS_ORDER}


def top_tier(probabilities: Mapping[TierCode, float]) -> TierCode:
    """Return the most probable tier."""
    return max(TIER_ORDER, key=lambda code: probabilities[code])


def damage_percent(probabilities: Mapping[TierCode, float]) -> float:
    """Weighted-expectation damage percentage in 0..100."""
    return sum(probabilities[code] * DAMAGE_WEIGHT[code] for code in TIER_ORDER)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && .venv/bin/pytest tests/test_tiers.py -v && .venv/bin/ruff check predict/tiers.py`
Expected: 10 passed, ruff clean

- [ ] **Step 5: Commit**

```bash
git add api/predict/tiers.py api/tests/test_tiers.py
git commit -m "feat(api): three-tier damage scale with alphabetical-order guard"
```

---

## Task 2: Classifier protocol, registry, and the mock backend

**Files:**
- Modify: `api/predict/interface.py`
- Create: `api/predict/registry.py`, `api/predict/backends/__init__.py`,
  `api/predict/backends/mock_backend.py`
- Delete: `api/predict/mock.py`, `api/predict/model.py`
- Test: `api/tests/test_registry.py`

**Interfaces:**
- Consumes: Task 1's `TierCode`, `probabilities_from_model`, `top_tier`, `damage_percent`
- Produces:
  - `Prediction` dataclass: `tier: TierCode`, `confidence: float`,
    `probabilities: dict[TierCode, float]`, `damage_percent: float`,
    `heatmap_base64: str | None`
  - `Classifier` Protocol: attrs `id: str`, `name: str`, `accuracy: float | None`;
    method `classify(image_bytes: bytes) -> Prediction`
  - `ModelInfo` dataclass: `id`, `name`, `accuracy`, `available`, `reason`
  - `list_models() -> list[ModelInfo]`
  - `get_classifier(model_id: str | None) -> Classifier` (raises `UnknownModelError`,
    `ModelUnavailableError`)
  - `default_model_id() -> str`

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_registry.py`:

```python
"""Registry roster, ENABLED_MODELS filtering, and graceful unavailability."""

import pytest

from predict.registry import (
    ModelUnavailableError,
    UnknownModelError,
    default_model_id,
    get_classifier,
    list_models,
)

SAMPLE = b"not-a-real-image-but-the-mock-only-hashes-it"


def test_mock_is_always_available_and_deterministic():
    mock = get_classifier("mock")
    first = mock.classify(SAMPLE)
    second = mock.classify(SAMPLE)
    assert first == second
    assert first.tier in ("NC", "PC", "GC")


def test_mock_emits_the_three_tier_contract():
    prediction = get_classifier("mock").classify(SAMPLE)
    assert set(prediction.probabilities) == {"NC", "PC", "GC"}
    assert prediction.probabilities[prediction.tier] == pytest.approx(
        prediction.confidence
    )
    assert sum(prediction.probabilities.values()) == pytest.approx(1.0, abs=1e-6)
    assert 0.0 <= prediction.damage_percent <= 100.0


def test_different_images_give_different_results():
    mock = get_classifier("mock")
    assert mock.classify(b"aaa") != mock.classify(b"zzz")


def test_enabled_models_filters_the_roster(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "mock")
    assert [m.id for m in list_models()] == ["mock"]


def test_enabled_models_can_show_raed_alone(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "raed")
    assert [m.id for m in list_models()] == ["raed"]


def test_unknown_ids_in_enabled_models_are_ignored(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "mock,does-not-exist")
    assert [m.id for m in list_models()] == ["mock"]


def test_empty_roster_falls_back_to_mock(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "nonsense-only")
    assert [m.id for m in list_models()] == ["mock"]


def test_unavailable_models_are_listed_with_a_reason(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "raed")
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    raed = next(m for m in list_models() if m.id == "raed")
    assert raed.available is False
    assert raed.reason == "weights_missing"


def test_selecting_an_unavailable_model_raises(monkeypatch):
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    with pytest.raises(ModelUnavailableError):
        get_classifier("raed")


def test_unknown_model_raises():
    with pytest.raises(UnknownModelError):
        get_classifier("gpt-9")


def test_default_is_the_first_available(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "raed,mock")
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    assert default_model_id() == "mock"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && .venv/bin/pytest tests/test_registry.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'predict.registry'`

- [ ] **Step 3: Rewrite `interface.py`**

Replace `api/predict/interface.py` entirely:

```python
"""The prediction seam: one Prediction shape, many interchangeable backends."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from predict.tiers import TierCode


@dataclass(frozen=True)
class Prediction:
    """A framework-agnostic classification result, in tier codes only.

    Carries no numeric class index by design — see predict/tiers.py.
    """

    tier: TierCode
    confidence: float
    probabilities: dict[TierCode, float]
    damage_percent: float
    heatmap_base64: str | None = None


@runtime_checkable
class Classifier(Protocol):
    """What every damage-classification backend must provide."""

    id: str
    name: str
    accuracy: float | None

    def classify(self, image_bytes: bytes) -> Prediction:
        """Classify a building photo into a damage tier."""
        ...
```

- [ ] **Step 4: Write the mock backend**

Create `api/predict/backends/__init__.py` (empty file) and
`api/predict/backends/mock_backend.py`:

```python
"""Deterministic stand-in classifier: same image bytes -> same tier, always.

Keeps CI and the cloud deployment working with zero heavy dependencies, and
gives the UI something honest to develop against. Hash-seeded, so it is
reproducible without being predictable-looking.
"""

from __future__ import annotations

import hashlib
import random

from predict.interface import Prediction
from predict.tiers import (
    MODEL_CLASS_ORDER,
    damage_percent,
    probabilities_from_model,
    top_tier,
)


class MockClassifier:
    """Hash-seeded fake classifier. Never loaded from weights, always available."""

    id = "mock"
    name = "Mock"
    accuracy: float | None = None

    def classify(self, image_bytes: bytes) -> Prediction:
        """Derive a stable pseudo-random tier distribution from the image bytes."""
        seed = int.from_bytes(hashlib.sha256(image_bytes).digest()[:8], "big")
        rng = random.Random(seed)

        # Dirichlet-ish: exponential draws normalized, so one tier dominates
        # rather than the vector coming out flat and uninformative.
        raw = [rng.expovariate(1.0) for _ in MODEL_CLASS_ORDER]
        total = sum(raw)
        probabilities = probabilities_from_model([value / total for value in raw])

        tier = top_tier(probabilities)
        return Prediction(
            tier=tier,
            confidence=probabilities[tier],
            probabilities=probabilities,
            damage_percent=damage_percent(probabilities),
            heatmap_base64=None,
        )
```

- [ ] **Step 5: Write the registry**

Create `api/predict/registry.py`:

```python
"""The classifier roster: which backends exist, which load, which are shown.

⚠ IMPORT ORDER IS LOAD-BEARING. torch is imported at module load, BEFORE any
TensorFlow import can happen. Importing torch *after* TensorFlow segfaults the
process (verified 2026-08-17: exit 139, core dumped). Because this registry
offers a Keras backend and an Ultralytics backend in the same FastAPI process,
and a user can switch between them at runtime, getting this wrong takes down the
whole API the first time someone switches models mid-demo — not just one request.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

try:  # noqa: SIM105 - the import itself is the point, not its result
    import torch  # noqa: F401  # MUST precede TensorFlow; see module docstring
except ImportError:
    pass  # torch is optional; the Keras and mock backends work without it

from predict.interface import Classifier

logger = logging.getLogger(__name__)

# Roster order is also UI order and default-selection order.
_ROSTER: tuple[str, ...] = ("resnet50-phinet", "yolo-cls", "raed", "mock")
_DEFAULT_ENABLED = "resnet50-phinet,yolo-cls,raed"

# Reasons are message keys, translated in the frontend — never raw English.
REASON_WEIGHTS_MISSING = "weights_missing"
REASON_DEPENDENCY_MISSING = "dependency_missing"
REASON_LOAD_FAILED = "load_failed"


class UnknownModelError(LookupError):
    """Raised when a caller asks for a model id that is not registered."""


class ModelUnavailableError(RuntimeError):
    """Raised when a registered model cannot be loaded right now."""

    def __init__(self, model_id: str, reason: str) -> None:
        super().__init__(f"model {model_id!r} is unavailable: {reason}")
        self.model_id = model_id
        self.reason = reason


@dataclass(frozen=True)
class ModelInfo:
    """What GET /models reports for one backend."""

    id: str
    name: str
    accuracy: float | None
    available: bool
    reason: str | None


def _load(model_id: str) -> Classifier:
    """Import and construct one backend. Raises ModelUnavailableError on failure."""
    if model_id == "mock":
        from predict.backends.mock_backend import MockClassifier

        return MockClassifier()
    if model_id == "resnet50-phinet":
        from predict.backends.resnet import ResNetClassifier

        return ResNetClassifier()
    if model_id == "yolo-cls":
        from predict.backends.yolo import YoloClassifier

        return YoloClassifier()
    if model_id == "raed":
        from predict.backends.raed import RaedClassifier

        return RaedClassifier()
    raise UnknownModelError(f"unknown model id: {model_id}")


# Loaded backends are cached: a Keras ResNet takes seconds to load and must not
# be re-read per request.
_cache: dict[str, Classifier] = {}


def _enabled_ids() -> list[str]:
    """Roster ids permitted by ENABLED_MODELS, in roster order.

    Unknown ids are warned about and dropped — a typo must not silently empty
    the roster. An empty result falls back to the mock so the API always has
    something to serve.
    """
    raw = os.environ.get("ENABLED_MODELS", _DEFAULT_ENABLED)
    requested = [item.strip() for item in raw.split(",") if item.strip()]
    unknown = [item for item in requested if item not in _ROSTER]
    for item in unknown:
        logger.warning("ENABLED_MODELS lists unknown model %r; ignoring", item)
    enabled = [model_id for model_id in _ROSTER if model_id in requested]
    if not enabled:
        logger.warning("ENABLED_MODELS matched no known model; falling back to mock")
        return ["mock"]
    return enabled


def get_classifier(model_id: str | None = None) -> Classifier:
    """Return a loaded backend by id, or the default when id is None.

    Raises:
        UnknownModelError: the id is not registered.
        ModelUnavailableError: the backend exists but cannot load.
    """
    resolved = model_id or default_model_id()
    if resolved not in _ROSTER:
        raise UnknownModelError(f"unknown model id: {resolved}")
    if resolved not in _cache:
        _cache[resolved] = _load(resolved)
    return _cache[resolved]


def list_models() -> list[ModelInfo]:
    """Report every enabled backend and whether it can actually run right now."""
    infos: list[ModelInfo] = []
    for model_id in _enabled_ids():
        try:
            backend = get_classifier(model_id)
        except ModelUnavailableError as exc:
            infos.append(
                ModelInfo(
                    id=model_id,
                    name=_fallback_name(model_id),
                    accuracy=None,
                    available=False,
                    reason=exc.reason,
                )
            )
            continue
        infos.append(
            ModelInfo(
                id=backend.id,
                name=backend.name,
                accuracy=backend.accuracy,
                available=True,
                reason=None,
            )
        )
    return infos


def default_model_id() -> str:
    """The first enabled backend that actually loads."""
    for info in list_models():
        if info.available:
            return info.id
    return "mock"


def _fallback_name(model_id: str) -> str:
    """Display name for a backend that could not be constructed."""
    return {
        "resnet50-phinet": "ResNet50 (PHI-Net)",
        "yolo-cls": "YOLO11-cls",
        "raed": "Raed's model",
        "mock": "Mock",
    }.get(model_id, model_id)
```

- [ ] **Step 6: Write the `raed` stub backend**

Create `api/predict/backends/raed.py`:

```python
"""Raed's classifier — registered now, loadable when his weights arrive.

Ships as a real roster entry rather than a future TODO so the picker shows it
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
        """Classify with Raed's model.

        Raises:
            NotImplementedError: until his architecture and preprocessing are
                known. Reaching here means weights exist but the adapter was
                never written — fail loudly rather than return a wrong tier.
        """
        raise NotImplementedError(
            "Raed's weights are present but the inference adapter is not written yet."
        )
```

- [ ] **Step 7: Delete the superseded modules**

```bash
git rm api/predict/mock.py api/predict/model.py
```

- [ ] **Step 8: Run the tests**

Run: `cd api && .venv/bin/pytest tests/test_registry.py tests/test_tiers.py -v && .venv/bin/ruff check predict/`
Expected: all pass, ruff clean

- [ ] **Step 9: Commit**

```bash
git add api/predict/ api/tests/test_registry.py
git commit -m "feat(api): classifier registry with ENABLED_MODELS roster and mock backend"
```

---

## Task 3: ResNet backend with the golden-sample test

The measured behaviour from spec §5.5 becomes an executable assertion.

**Files:**
- Create: `api/predict/backends/resnet.py`, `api/requirements-models.txt`
- Test: `api/tests/test_resnet.py`

**Interfaces:**
- Consumes: Task 1 tiers, Task 2 `Prediction`/`ModelUnavailableError`
- Produces: `ResNetClassifier` satisfying `Classifier`

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_resnet.py`:

```python
"""The ResNet backend, pinned to a measured real prediction.

Skipped when TensorFlow or the weights are absent, so CI stays light.
"""

import os
import pathlib

import pytest

from predict.registry import ModelUnavailableError

SAMPLE = pathlib.Path(__file__).resolve().parents[2] / "demo" / "damaged" / "partial.jpg"


def _backend():
    pytest.importorskip("tensorflow")
    from predict.backends.resnet import ResNetClassifier

    try:
        return ResNetClassifier()
    except ModelUnavailableError as exc:
        pytest.skip(f"resnet unavailable: {exc.reason}")


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample image not present")
def test_classifies_the_partial_damage_sample_as_pc():
    """Measured 2026-08-17: GC 0.221 / NC 0.178 / PC 0.600.

    This is the Caffe-preprocessing regression guard. If preprocessing drifts
    (RGB instead of BGR, /255 normalization, wrong means) the model still
    returns confident numbers — they are just wrong. Only this assertion catches it.
    """
    prediction = _backend().classify(SAMPLE.read_bytes())
    assert prediction.tier == "PC"
    assert prediction.probabilities["PC"] == pytest.approx(0.60, abs=0.05)
    assert prediction.probabilities["GC"] == pytest.approx(0.22, abs=0.05)
    assert prediction.probabilities["NC"] == pytest.approx(0.18, abs=0.05)


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample image not present")
def test_contract_shape():
    prediction = _backend().classify(SAMPLE.read_bytes())
    assert set(prediction.probabilities) == {"NC", "PC", "GC"}
    assert sum(prediction.probabilities.values()) == pytest.approx(1.0, abs=1e-4)
    assert prediction.confidence == prediction.probabilities[prediction.tier]
    assert 0.0 <= prediction.damage_percent <= 100.0
    assert prediction.heatmap_base64 is None  # Grad-CAM is a later stretch


def test_missing_weights_report_unavailable(monkeypatch):
    pytest.importorskip("tensorflow")
    monkeypatch.setenv("RESNET_WEIGHTS_PATH", "/nonexistent/model.keras")
    from predict.backends.resnet import ResNetClassifier

    with pytest.raises(ModelUnavailableError) as exc:
        ResNetClassifier()
    assert exc.value.reason == "weights_missing"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && .venv/bin/pytest tests/test_resnet.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'predict.backends.resnet'`
(or skip if TensorFlow is not yet installed in the api venv — install it in Step 4)

- [ ] **Step 3: Write the implementation**

Create `api/predict/backends/resnet.py`:

```python
"""ResNet50 damage classifier (PHI-Net Task 5, Collapse Mode), 74.66% val acc.

Trained with Caffe-style preprocessing. Getting that pipeline wrong does not
raise — it yields confidently wrong tiers — so the steps below are exact and
tests/test_resnet.py pins them to a measured real prediction.
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
# during training.
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
        except Exception as exc:  # noqa: BLE001 - any load failure is "unavailable"
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

        # The model emits GC, NC, PC alphabetically — convert at this boundary.
        probabilities = probabilities_from_model(vector.tolist())
        tier = top_tier(probabilities)
        return Prediction(
            tier=tier,
            confidence=probabilities[tier],
            probabilities=probabilities,
            damage_percent=damage_percent(probabilities),
            heatmap_base64=None,
        )
```

- [ ] **Step 4: Install the heavy dependencies**

Create `api/requirements-models.txt`:

```
# Heavy, OPTIONAL classifier dependencies. Deliberately NOT in requirements.txt:
# the base image and the free-tier cloud deployment run on the mock backend.
# Install locally with:  .venv/bin/pip install -r requirements-models.txt
#
# ⚠ torch must be imported before tensorflow at runtime (see predict/registry.py).
tensorflow==2.21.0
torch==2.12.0
ultralytics==8.4.56
numpy>=1.26
```

Run: `cd api && .venv/bin/pip install -r requirements-models.txt`
Expected: installs (several minutes, ~3 GB)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && .venv/bin/pytest tests/test_resnet.py -v`
Expected: 3 passed (PC predicted at ~0.60), 0 skipped

- [ ] **Step 6: Commit**

```bash
git add api/predict/backends/resnet.py api/tests/test_resnet.py api/requirements-models.txt
git commit -m "feat(api): ResNet50 backend pinned by a measured golden-sample test"
```

---

## Task 4: Retrain YOLO on three classes, then wrap it

`models/yolo_cls.pt` is a two-class model (`{0: 'GC', 1: 'PC'}`). It cannot emit
NC and its 80.37% is not comparable to the ResNet's 74.66%. The three-class data
is already prepared at `data/yolo_cls/` (train GC 525 / NC 322 / PC 379).

**Files:**
- Create: `api/predict/backends/yolo.py`
- Modify: `/home/mohrazzak/projects/graduation/scripts/train_yolo.py`
- Test: `api/tests/test_yolo.py`

**Interfaces:**
- Consumes: Task 1 `probabilities_from_names`, Task 2 `Prediction`
- Produces: `YoloClassifier` satisfying `Classifier`

- [ ] **Step 1: Retrain on the three-class split**

In `/home/mohrazzak/projects/graduation/scripts/train_yolo.py`, change the data
path and the docstring:

```python
"""Train a YOLO11 classification model on the PHI-Net Task 5 THREE-CLASS data.

Trains on data/yolo_cls (GC/NC/PC) — NOT the binary split. The binary model this
script used to produce could not emit NC, so it could not serve the product's
tier contract, and its accuracy was not comparable to the three-class ResNet.
"""
```

and in `main()`:

```python
    model.train(
        data="data/yolo_cls",   # three classes: GC, NC, PC
        epochs=30,
        imgsz=224,
        batch=16,
        device=0,               # GTX 1650 Ti via WSL
        patience=8,
        verbose=True,
    )
```

Run:
```bash
cd /home/mohrazzak/projects/graduation && .venv/bin/python scripts/train_yolo.py
```
Expected: finishes in minutes on the 1650 Ti, prints
`SAVED models/yolo_cls.pt | val top1 accuracy = 0.XXXX`

- [ ] **Step 2: Verify it now has three classes**

Run:
```bash
cd /home/mohrazzak/projects/graduation && .venv/bin/python -c "
import torch
from ultralytics import YOLO
print(YOLO('models/yolo_cls.pt').names)
"
```
Expected: `{0: 'GC', 1: 'NC', 2: 'PC'}` — three entries including NC.

**If the retrained accuracy is materially worse than the ResNet's 74.66%,** stop
and report it. Per spec §5.6 YOLO is then dropped from the roster rather than
shipped with a flattering incomparable number.

- [ ] **Step 3: Write the failing test**

Create `api/tests/test_yolo.py`:

```python
"""The YOLO backend, and the guard against re-shipping a two-class model."""

import pathlib

import pytest

from predict.registry import ModelUnavailableError

SAMPLE = pathlib.Path(__file__).resolve().parents[2] / "demo" / "damaged" / "partial.jpg"


def _backend():
    pytest.importorskip("ultralytics")
    from predict.backends.yolo import YoloClassifier

    try:
        return YoloClassifier()
    except ModelUnavailableError as exc:
        pytest.skip(f"yolo unavailable: {exc.reason}")


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample image not present")
def test_emits_all_three_tiers():
    """The binary model shipped before could not produce NC at all."""
    prediction = _backend().classify(SAMPLE.read_bytes())
    assert set(prediction.probabilities) == {"NC", "PC", "GC"}


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample image not present")
def test_contract_shape():
    prediction = _backend().classify(SAMPLE.read_bytes())
    assert sum(prediction.probabilities.values()) == pytest.approx(1.0, abs=1e-4)
    assert prediction.confidence == prediction.probabilities[prediction.tier]
    assert prediction.heatmap_base64 is None


def test_missing_weights_report_unavailable(monkeypatch):
    pytest.importorskip("ultralytics")
    monkeypatch.setenv("YOLO_WEIGHTS_PATH", "/nonexistent/yolo.pt")
    from predict.backends.yolo import YoloClassifier

    with pytest.raises(ModelUnavailableError) as exc:
        YoloClassifier()
    assert exc.value.reason == "weights_missing"
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd api && .venv/bin/pytest tests/test_yolo.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'predict.backends.yolo'`

- [ ] **Step 5: Write the implementation**

Create `api/predict/backends/yolo.py`:

```python
"""YOLO11-cls damage classifier over the three PHI-Net collapse tiers.

Reads the model's OWN class-name table rather than assuming positions, so a
retrain that reorders classes cannot silently mislabel. A two-class model raises
at construction instead of serving predictions it cannot make.
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
from predict.tiers import damage_percent, probabilities_from_names, top_tier

DEFAULT_WEIGHTS = "/home/mohrazzak/projects/graduation/models/yolo_cls.pt"
DEFAULT_ACCURACY_FILE = "/home/mohrazzak/projects/graduation/models/yolo_accuracy.txt"


@functools.lru_cache(maxsize=1)
def _load_model(path: str):  # noqa: ANN202 - returns an ultralytics YOLO
    """Load and cache the YOLO model."""
    import torch  # noqa: F401  # keep torch ahead of any TensorFlow import
    from ultralytics import YOLO

    return YOLO(path)


def _read_accuracy(path: str) -> float | None:
    """Read the recorded validation top-1 accuracy, if the sidecar file exists."""
    try:
        with open(path) as handle:
            return float(handle.read().strip())
    except (OSError, ValueError):
        return None


class YoloClassifier:
    """Ultralytics YOLO11 classifier over GC/NC/PC."""

    id = "yolo-cls"
    name = "YOLO11-cls"

    def __init__(self) -> None:
        path = os.environ.get("YOLO_WEIGHTS_PATH", DEFAULT_WEIGHTS).strip()
        if not path or not os.path.exists(path):
            raise ModelUnavailableError(self.id, REASON_WEIGHTS_MISSING)
        try:
            import ultralytics  # noqa: F401
        except ImportError as exc:
            raise ModelUnavailableError(self.id, REASON_DEPENDENCY_MISSING) from exc
        try:
            model = _load_model(path)
        except Exception as exc:  # noqa: BLE001
            raise ModelUnavailableError(self.id, REASON_LOAD_FAILED) from exc

        # A two-class model cannot serve the tier contract — refuse to load it
        # rather than emit predictions that can never say NC.
        labels = {str(name).upper() for name in model.names.values()}
        if not {"NC", "PC", "GC"} <= labels:
            raise ModelUnavailableError(self.id, REASON_LOAD_FAILED)

        self._path = path
        self.accuracy: float | None = _read_accuracy(
            os.environ.get("YOLO_ACCURACY_PATH", DEFAULT_ACCURACY_FILE)
        )

    def classify(self, image_bytes: bytes) -> Prediction:
        """Classify a building photo into a damage tier."""
        from PIL import Image

        model = _load_model(self._path)
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        result = model.predict(image, verbose=False)[0]

        probabilities = probabilities_from_names(
            model.names, result.probs.data.tolist()
        )
        tier = top_tier(probabilities)
        return Prediction(
            tier=tier,
            confidence=probabilities[tier],
            probabilities=probabilities,
            damage_percent=damage_percent(probabilities),
            heatmap_base64=None,
        )
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd api && .venv/bin/pytest tests/test_yolo.py -v && .venv/bin/ruff check predict/`
Expected: 3 passed, ruff clean

- [ ] **Step 7: Commit**

```bash
git add api/predict/backends/yolo.py api/tests/test_yolo.py
git commit -m "feat(api): three-class YOLO backend, refusing two-class weights"
```

---

## Task 5: API routes

**Files:**
- Modify: `api/schemas.py`, `api/main.py`
- Modify: `api/tests/test_api.py`
- Test: `api/tests/test_models_route.py`

**Interfaces:**
- Consumes: Task 2 `list_models`, `get_classifier`, `default_model_id`, errors
- Produces: `POST /predict?model=<id>`, `GET /models`, `GET /health`

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_models_route.py`:

```python
"""GET /models and model selection on POST /predict."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from main import create_app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ENABLED_MODELS", "mock")
    return TestClient(create_app())


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (120, 120, 120)).save(buffer, format="PNG")
    return buffer.getvalue()


def _upload(client, model: str | None = None):
    path = "/predict" if model is None else f"/predict?model={model}"
    return client.post(path, files={"file": ("b.png", _png(), "image/png")})


def test_models_lists_the_enabled_roster(client):
    body = client.get("/models").json()
    assert [m["id"] for m in body["models"]] == ["mock"]
    assert body["models"][0]["available"] is True
    assert body["models"][0]["reason"] is None


def test_predict_returns_tier_codes_not_indices(client):
    body = _upload(client).json()
    assert body["tier"] in ("NC", "PC", "GC")
    assert set(body["probabilities"]) == {"NC", "PC", "GC"}
    assert "level" not in body
    assert isinstance(body["probabilities"], dict)


def test_predict_reports_which_model_ran(client):
    body = _upload(client).json()
    assert body["model"]["id"] == "mock"
    assert 0.0 <= body["damage_percent"] <= 100.0


def test_predict_rejects_an_unknown_model(client):
    response = _upload(client, model="gpt-9")
    assert response.status_code == 400
    assert "gpt-9" in response.json()["detail"]


def test_predict_reports_an_unavailable_model_as_503(client, monkeypatch):
    monkeypatch.delenv("RAED_WEIGHTS_PATH", raising=False)
    response = _upload(client, model="raed")
    assert response.status_code == 503
    assert "detail" in response.json()


def test_health_reports_the_active_model(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["model"] == "mock"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && .venv/bin/pytest tests/test_models_route.py -v`
Expected: FAIL — response still has `level`, and `/models` returns 404

- [ ] **Step 3: Rewrite `schemas.py`**

```python
"""Pydantic response models for the tier-based API contract (spec §4)."""

from pydantic import BaseModel, Field

from predict.tiers import TierCode


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


class PredictionResponse(BaseModel):
    """JSON body returned by POST /predict.

    Probabilities are keyed by tier CODE, never by index — see predict/tiers.py.
    """

    tier: TierCode
    confidence: float = Field(ge=0, le=1)
    probabilities: dict[TierCode, float]
    damage_percent: float = Field(ge=0, le=100)
    model: ModelInfoResponse
    heatmap_base64: str | None = None


class HealthResponse(BaseModel):
    """JSON body returned by GET /health."""

    status: str
    mock: bool
    model: str
```

- [ ] **Step 4: Update `main.py`**

Replace the `/health` and `/predict` handlers, and add `/models`. Keep every
existing upload guard (content type, Content-Length precheck, post-read size
check, Pillow verify) exactly as it is — only the prediction call and the
response construction change:

```python
from predict.registry import (
    ModelUnavailableError,
    UnknownModelError,
    default_model_id,
    get_classifier,
    list_models,
)
from schemas import (
    HealthResponse,
    ModelInfoResponse,
    ModelsResponse,
    PredictionResponse,
)


    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        """Liveness probe that also reports which classifier is active."""
        active = default_model_id()
        return HealthResponse(status="ok", mock=active == "mock", model=active)

    @app.get("/models", response_model=ModelsResponse)
    def models() -> ModelsResponse:
        """List the enabled classifier backends and whether each can run now."""
        return ModelsResponse(
            models=[
                ModelInfoResponse(
                    id=info.id,
                    name=info.name,
                    accuracy=info.accuracy,
                    available=info.available,
                    reason=info.reason,
                )
                for info in list_models()
            ]
        )
```

and inside `predict`, replacing `prediction = get_predictor()(data)`:

```python
        try:
            classifier = get_classifier(model)
        except UnknownModelError as exc:
            raise HTTPException(
                status_code=400, detail=f"Unknown model {model!r}."
            ) from exc
        except ModelUnavailableError as exc:
            raise HTTPException(
                status_code=503,
                detail="That model is not available on this server right now.",
            ) from exc

        prediction = classifier.classify(data)
        return PredictionResponse(
            tier=prediction.tier,
            confidence=prediction.confidence,
            probabilities=prediction.probabilities,
            damage_percent=prediction.damage_percent,
            model=ModelInfoResponse(
                id=classifier.id,
                name=classifier.name,
                accuracy=classifier.accuracy,
            ),
            heatmap_base64=prediction.heatmap_base64,
        )
```

The handler signature gains the query parameter:

```python
    async def predict(
        request: Request, file: UploadFile, model: str | None = None
    ) -> PredictionResponse:
```

- [ ] **Step 5: Update the existing contract tests**

In `api/tests/test_api.py`, replace every assertion about `level` and the
six-float array with the tier contract. Add `monkeypatch.setenv("ENABLED_MODELS",
"mock")` to the client fixture so the suite never loads heavy backends.

- [ ] **Step 6: Run the full suite**

Run: `cd api && ENABLED_MODELS=mock .venv/bin/pytest -q && .venv/bin/ruff check .`
Expected: all pass, ruff clean

- [ ] **Step 7: Commit**

```bash
git add api/schemas.py api/main.py api/tests/
git commit -m "feat(api): tier-based /predict, /models roster, model id on /health"
```

---

## Task 6: Web domain migration

**Files:**
- Create: `web/lib/tiers.ts`
- Delete: `web/lib/levels.ts`
- Modify: `web/lib/types.ts`, `web/lib/api.ts`

**Interfaces:**
- Consumes: Task 5's wire contract
- Produces:
  - `TierCode = "NC" | "PC" | "GC"`, `DAMAGE_TIERS: readonly DamageTier[]`
  - `getTier(code: string): DamageTier`, `isAlertTier(code: TierCode): boolean`
  - `Prediction`, `ModelInfo`, `Analysis` in `lib/types.ts`
  - `predictDamage(file, modelId?)`, `getModels()` in `lib/api.ts`

- [ ] **Step 1: Write `lib/tiers.ts`**

```typescript
// Single source of truth for the three-tier damage scale. Every badge, bar,
// scale segment, and history strip derives color + i18n key from here.
//
// NC is "non-collapse", NOT "intact": PHI-Net defines it as "intact or minor
// damage, structure remains". Never label it as undamaged.
export type TierCode = "NC" | "PC" | "GC";

export interface DamageTier {
  readonly code: TierCode;
  readonly key: "nonCollapse" | "partialCollapse" | "globalCollapse";
  readonly color: string; // ramp hex, applied inline (Tailwind cannot generate runtime classes)
}

// Severity order. Iterate this everywhere; never sort by object key.
export const DAMAGE_TIERS: readonly DamageTier[] = [
  { code: "NC", key: "nonCollapse", color: "#22C55E" },
  { code: "PC", key: "partialCollapse", color: "#F97316" },
  { code: "GC", key: "globalCollapse", color: "#991B1B" },
] as const;

// Only GC gets the alert color and the hazard stripe.
export const ALERT_TIER: TierCode = "GC";

// Validates untrusted values (API responses, DB rows) into a tier entry.
export function getTier(code: string): DamageTier {
  const tier = DAMAGE_TIERS.find((entry) => entry.code === code);
  if (tier === undefined) {
    throw new RangeError(`Damage tier must be NC, PC, or GC, received ${code}`);
  }
  return tier;
}

export function isAlertTier(code: TierCode): boolean {
  return code === ALERT_TIER;
}
```

- [ ] **Step 2: Update `lib/types.ts`**

```typescript
// Shared data contracts: what the FastAPI /predict endpoint returns
// (Prediction) and what an analyses row in Supabase looks like (Analysis).
import type { TierCode } from "./tiers";

export interface ModelInfo {
  id: string;
  name: string;
  accuracy: number | null; // 0..1
  available: boolean;
  reason: string | null; // message key: weights_missing | dependency_missing | load_failed
}

export type TierProbabilities = Record<TierCode, number>;

export interface Prediction {
  tier: TierCode;
  confidence: number; // 0..1
  probabilities: TierProbabilities; // sums ~1
  damage_percent: number; // 0..100
  model: ModelInfo;
  heatmap_base64: string | null; // PNG bytes base64, no data: prefix
}

export interface Analysis {
  id: string;
  user_id: string;
  image_path: string;
  heatmap_path: string | null;
  tier: TierCode;
  confidence: number;
  probabilities: TierProbabilities;
  damage_percent: number;
  model_id: string;
  created_at: string; // ISO timestamp
}
```

- [ ] **Step 3: Update `lib/api.ts`**

Replace `toPrediction` and add `getModels`. Keep `requestJson`, `readDetail`,
`isAbortError`, `warmUpApi`, and the error mapping unchanged:

```typescript
import { DAMAGE_TIERS, getTier, type TierCode } from "./tiers";
import type { ModelInfo, Prediction, TierProbabilities } from "./types";

export async function predictDamage(
  file: File | Blob,
  modelId?: string,
): Promise<Prediction> {
  const form = new FormData();
  form.append("file", file);
  const path = modelId ? `/predict?model=${encodeURIComponent(modelId)}` : "/predict";
  const body = await requestJson(path, { method: "POST", body: form }, PREDICT_TIMEOUT_MS);
  return toPrediction(body);
}

// GET /models — the classifier roster the picker renders.
export async function getModels(): Promise<ModelInfo[]> {
  const body = await requestJson("/models", { method: "GET" }, HEALTH_TIMEOUT_MS);
  if (typeof body !== "object" || body === null) {
    throw new ApiError("server", "GET /models returned a non-object body");
  }
  const raw = (body as Record<string, unknown>).models;
  if (!Array.isArray(raw)) {
    throw new ApiError("server", "GET /models is missing the models array");
  }
  return raw.map(toModelInfo);
}

function toModelInfo(entry: unknown): ModelInfo {
  if (typeof entry !== "object" || entry === null) {
    throw new ApiError("server", "GET /models returned a non-object entry");
  }
  const raw = entry as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.name !== "string") {
    throw new ApiError("server", "a model entry is missing id or name");
  }
  const accuracy =
    typeof raw.accuracy === "number" && Number.isFinite(raw.accuracy)
      ? raw.accuracy
      : null;
  return {
    id: raw.id,
    name: raw.name,
    accuracy,
    available: raw.available !== false,
    reason: typeof raw.reason === "string" ? raw.reason : null,
  };
}

function toPrediction(body: unknown): Prediction {
  if (typeof body !== "object" || body === null) {
    throw contractViolation("body is not an object");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.tier !== "string") {
    throw contractViolation("tier is missing or not a string");
  }
  let tier: TierCode;
  try {
    tier = getTier(raw.tier).code;
  } catch {
    throw contractViolation(`tier ${raw.tier} is not NC, PC, or GC`);
  }

  const confidence = raw.confidence;
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw contractViolation("confidence is not a number in 0..1");
  }

  const probabilitiesRaw = raw.probabilities;
  if (typeof probabilitiesRaw !== "object" || probabilitiesRaw === null) {
    throw contractViolation("probabilities is not an object");
  }
  const entries = probabilitiesRaw as Record<string, unknown>;
  const probabilities = {} as TierProbabilities;
  for (const { code } of DAMAGE_TIERS) {
    const value = entries[code];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw contractViolation(`probabilities.${code} is missing or not a number`);
    }
    probabilities[code] = value;
  }

  const damagePercent = raw.damage_percent;
  if (
    typeof damagePercent !== "number" ||
    !Number.isFinite(damagePercent) ||
    damagePercent < 0 ||
    damagePercent > 100
  ) {
    throw contractViolation("damage_percent is not a number in 0..100");
  }

  const heatmap = raw.heatmap_base64;
  if (typeof heatmap !== "string" && heatmap !== null && heatmap !== undefined) {
    throw contractViolation("heatmap_base64 is not a string or null");
  }

  return {
    tier,
    confidence,
    probabilities,
    damage_percent: damagePercent,
    model: toModelInfo(raw.model),
    heatmap_base64: typeof heatmap === "string" ? heatmap : null,
  };
}
```

Update `getHealth` to also return `model: string`.

- [ ] **Step 4: Delete `levels.ts` and typecheck**

```bash
git rm web/lib/levels.ts
cd web && npx tsc --noEmit
```
Expected: errors ONLY in the components Task 7 migrates. Record that list — it is
Task 7's worklist.

- [ ] **Step 5: Commit**

```bash
git add web/lib/
git commit -m "feat(web): tier domain module, tier-based API client"
```

---

## Task 7: Component migration

Drive this from the `tsc --noEmit` error list produced in Task 6.

**Files:**
- Create: `web/components/ui/TierStrip.tsx`
- Delete: `web/components/ui/ScaleStrip.tsx`
- Modify: every component surfaced by the typecheck — `ResultPanel`,
  `ConfidenceBars`, `AnalysisCard`, `AnalysisModal`, `HistoryStats`,
  `HistoryClient`, `AnalyzeClient`, `useSaveAnalysis`, `SampleStrip`,
  `ReportSheet`, navbar logo, landing hero

- [ ] **Step 1: Write `TierStrip.tsx`**

Port `ScaleStrip.tsx` to three segments, iterating `DAMAGE_TIERS`, keeping its
existing props shape, sizing variants, and animation gating. Keep the file under
150 lines and the export named.

- [ ] **Step 2: Migrate components one at a time**

For each error from Task 6: replace `DamageLevelId`→`TierCode`,
`getLevel(n)`→`getTier(code)`, `isAlertLevel`→`isAlertTier`,
`ScaleStrip`→`TierStrip`, six-element probability arrays→`DAMAGE_TIERS.map`,
`level` message keys→`tiers.<key>.*`.

- [ ] **Step 3: Typecheck after each component**

Run: `cd web && npx tsc --noEmit`
Expected: the error count strictly decreases; finish at 0.

- [ ] **Step 4: Verify the heatmap null path**

The mock always returned a heatmap, so `heatmap_base64: null` may never have been
exercised. Confirm `ImageWithHeatmap`, `HeatmapToggle`, `HeatmapRevealLayer`, and
the history modal all hide their heatmap affordances cleanly when it is null —
no empty overlay, no dead toggle, no orphaned slider.

- [ ] **Step 5: Commit**

```bash
git add web/components/ web/lib/
git commit -m "feat(web): migrate components from six levels to three tiers"
```

---

## Task 8: Messages, new result components, model picker

**Files:**
- Modify: `web/messages/en.json`, `web/messages/ar.json`
- Create: `web/components/analyze/DamageGauge.tsx`,
  `web/components/analyze/RecommendationCard.tsx`,
  `web/components/analyze/ModelPicker.tsx`

- [ ] **Step 1: Add the message keys**

Under `tiers.*` for each of `nonCollapse`, `partialCollapse`, `globalCollapse`:
`label`, `code`, `description`, `recommendation.title`, `recommendation.items`
(string array, read with `t.raw(key) as string[]`).

English labels: "Non-collapse", "Partial collapse", "Global collapse".
Arabic labels: "لا انهيار", "انهيار جزئي", "انهيار كامل".

Recommendation content is the EN+AR text from
`/home/mohrazzak/projects/graduation/CLAUDE.md` (spec §3.3), verbatim.

Also add `models.*` (`label`, `accuracy`, and reason keys `weights_missing`,
`dependency_missing`, `load_failed`) and `analyze.damagePercent.*`.

- [ ] **Step 2: Write `DamageGauge.tsx`**

Client component. Renders `damage_percent` in JetBrains Mono with a count-up
animation gated by `useReducedMotion`, tier-colored, formatted through
next-intl's number formatter. Copy must frame it as an estimate, never a survey
figure.

- [ ] **Step 3: Write `RecommendationCard.tsx`**

Server component, props `{ tier: TierCode }`. Renders the tier's recommendation
title and bullet list. GC gets the `alert` treatment plus the hazard stripe; NC
and PC do not.

- [ ] **Step 4: Write `ModelPicker.tsx`**

Client component, props `{ models: ModelInfo[]; value: string; onChange: (id: string) => void }`.
Renders name + accuracy per option. Unavailable models render **disabled with a
translated reason**, never hidden. **At exactly one option it renders a static
label, not a dropdown.**

- [ ] **Step 5: Typecheck and commit**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: zero errors

```bash
git add web/
git commit -m "feat(web): damage gauge, recommendations, model picker"
```

---

## Task 9: Database migration

**Files:**
- Create: `supabase/migrations/2026-08-17-tiers.sql`
- Modify: `supabase/schema.sql`, `web/lib/supabase/queries.ts`

- [ ] **Step 1: Write the migration**

```sql
-- Six levels -> three tiers. Existing rows hold mock verdicts on a scale that
-- no longer exists; mapping them would fabricate assessments, so they go.
--
-- ORDER MATTERS: the NOT NULL columns below cannot be added to a non-empty
-- table, so the wipe comes first.
--
-- Storage objects must be cleared through the Storage API, not SQL — a protect
-- trigger blocks deleting storage.objects rows.
delete from public.analyses;

alter table public.analyses drop column level;
alter table public.analyses add column tier text not null
  check (tier in ('NC','PC','GC'));
alter table public.analyses add column damage_percent real not null
  check (damage_percent between 0 and 100);
alter table public.analyses add column model_id text not null;
alter table public.analyses add column repaired_path text;
alter table public.analyses add column model3d_path text;
```

Apply it via the session pooler (`aws-1-eu-north-1.pooler.supabase.com:5432`,
user `postgres.<project-ref>`) — the direct `db.<ref>.supabase.co` host is
IPv6-only and unreachable from this WSL2 box. Ask the user for the password;
never commit it.

- [ ] **Step 2: Fold the same changes into `schema.sql`**

So a fresh provision produces the new shape directly.

- [ ] **Step 3: Update `lib/supabase/queries.ts`**

Insert and read `tier`, `damage_percent`, `model_id`; probabilities become an
object. Validate untrusted rows through `getTier()`.

- [ ] **Step 4: Verify end to end**

Register → analyze → result saves → appears in history → survives logout/login.

- [ ] **Step 5: Commit**

```bash
git add supabase/ web/lib/supabase/
git commit -m "feat(db): migrate analyses from six levels to three tiers"
```

---

## Task 10: Six-level residue sweep

**Files:** `web/components/how-it-works/*`, `web/components/report/ReportSheet.tsx`,
`web/components/analyze/SampleStrip.tsx`, `web/public/samples/`, `web/messages/*`,
`CLAUDE.md`

- [ ] **Step 1: Fill how-it-works with real values**

`DatasetSection`: PHI-Net (PEER, UC Berkeley), Task 5 Collapse Mode, class counts
train GC 525 / NC 322 / PC 379, val 67 / 39 / 40. `ModelSection`: ResNet50
transfer learning, ImageNet weights. `MetricsSection`: 74.66% for ResNet,
the retrained figure for YOLO (**never the old binary 80.37%**).
`ConfusionMatrixSlot`: 3×3.

- [ ] **Step 2: Replace the samples**

`web/public/samples/` currently has the six `level-*.jpg` deleted and one
`partial.jpg` added. Provide three — one per tier — and update `SampleStrip`.

- [ ] **Step 3: Sweep the remaining copy**

Search `web/messages/{en,ar}.json` and landing copy for "six", "0-5", "levels".
Update `ReportSheet` to the tier scale.

- [ ] **Step 4: Update `CLAUDE.md`**

Replace the six-level table with the three-tier table, record the new `/predict`
contract, the `ENABLED_MODELS` roster, the alphabetical-index trap, and the
torch-before-TensorFlow constraint.

- [ ] **Step 5: Commit**

```bash
git add web/ CLAUDE.md
git commit -m "docs+web: remove six-level residue, fill how-it-works with real metrics"
```

---

## Task 11: Verification

- [ ] **Step 1: Gates**

```bash
cd api && ENABLED_MODELS=mock .venv/bin/pytest -q && .venv/bin/ruff check .
cd ../web && npx tsc --noEmit && npm run lint && npm run build
```
Expected: all clean, zero `any`

- [ ] **Step 2: Real-model smoke test**

```bash
cd api && .venv/bin/uvicorn main:app --port 8000 &
curl -s localhost:8000/models
curl -s -F "file=@../demo/damaged/partial.jpg" "localhost:8000/predict?model=resnet50-phinet"
```
Expected: `/models` lists three entries; `/predict` returns `"tier":"PC"` with
`probabilities.PC ≈ 0.60`

- [ ] **Step 3: Model-switch crash test**

Call `/predict` with `model=resnet50-phinet`, then `model=yolo-cls`, then back —
in that order, against **one** running server. Expected: three successful
responses, no segfault. This is the torch-before-TensorFlow guard under load.

- [ ] **Step 4: Browser verification, both locales**

Per CLAUDE.md: no Playwright in the repo; the working setup is at `/tmp/e2e`.
Drive snap chromium over CDP (`--headless=new --no-sandbox
--remote-debugging-port=9222 --user-data-dir=$HOME/.cache/cdp-profile`,
`connectOverCDP`). Screenshots must go under `$HOME`, never `/tmp`. Add
`--virtual-time-budget=15000` for settled full-page shots.

Check at 390px and 1440px, `/en` and `/ar`: tier strip mirrors, recommendations
render, damage gauge formats, model picker is keyboard-operable, GC shows the
alert banner and NC/PC do not.

- [ ] **Step 5: Reduced-motion pass**

With `prefers-reduced-motion: reduce`, the damage gauge shows its final value
immediately and no animation runs.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: phase 1 verification — tiers and real classifiers end to end"
```

---

## What Phase 1 deliberately leaves out

Each gets its own plan: the job API and Gemini repair (spec §4.4, §6), Tripo 3D
and the model-viewer (§7), the tier-gated service rail (§8), and demo fixtures
(§12). The manual mask editor, OccFacade, cost estimation, and the Depth Anything
fallback are out of scope entirely (§15).
