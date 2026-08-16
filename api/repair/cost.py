"""Stage C — the repair cost estimate.

A *parametric* estimate, not a magic number: cost is driven by the Stage A
damage level, the building's affected floor area, and a regional unit
reconstruction cost. Every input is explicit and every output is a RANGE with
its assumptions attached — which is the honest, defensible way to present a
figure no single photo can pin down precisely (state this at the defense).

    cost = affected_area_m2 x rebuild_fraction(level) x unit_cost_per_m2

Pure functions, no I/O, no API key — runs and tests offline.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Fraction of a full rebuild implied by each damage level. Level 0 is intact;
# level 5 is total destruction (~full rebuild). Mid-levels interpolate the share
# of structure/finishes that must be redone. These are planning assumptions, not
# measurements — surface them as such.
_REBUILD_FRACTION = {
    0: 0.00,
    1: 0.10,
    2: 0.25,
    3: 0.50,
    4: 0.75,
    5: 1.00,
}

# Default unit reconstruction cost (USD per m2), as a low/high band. Ukraine
# residential reconstruction estimates cluster in this range across published
# recovery assessments (e.g. the World Bank / Government of Ukraine RDNA series);
# cite the exact source in the report and override DEFAULT_UNIT_COST to match it.
DEFAULT_UNIT_COST = (400.0, 1500.0)  # (low, high) USD per m2

# +/- band applied to the point estimate to acknowledge photo-only uncertainty.
_UNCERTAINTY = 0.30


@dataclass
class CostEstimate:
    """A repair-cost estimate as a band, with the assumptions that produced it."""

    currency: str
    low: float
    expected: float
    high: float
    assumptions: dict[str, float | int | str] = field(default_factory=dict)

    def summary(self) -> str:
        """One-line human-readable range, e.g. 'USD 31,200 - 117,000 (≈ 74,100)'."""
        return (
            f"{self.currency} {self.low:,.0f} - {self.high:,.0f} "
            f"(≈ {self.expected:,.0f})"
        )


def estimate_cost(
    level: int,
    affected_area_m2: float,
    *,
    unit_cost: tuple[float, float] = DEFAULT_UNIT_COST,
    currency: str = "USD",
) -> CostEstimate:
    """Estimate building repair cost from damage level and affected floor area.

    Args:
        level: Stage A damage level, 0-5.
        affected_area_m2: floor area of the damaged building (footprint x floors).
        unit_cost: (low, high) reconstruction cost per m2 for the region.
        currency: ISO currency label for display.

    Returns:
        A CostEstimate band with the inputs recorded under ``assumptions``.

    Raises:
        ValueError: if level is out of range or area is non-positive.
    """
    if level not in _REBUILD_FRACTION:
        raise ValueError(f"level must be 0-5, got {level}")
    if affected_area_m2 <= 0:
        raise ValueError(f"affected_area_m2 must be positive, got {affected_area_m2}")

    fraction = _REBUILD_FRACTION[level]
    low_unit, high_unit = unit_cost
    mid_unit = (low_unit + high_unit) / 2

    expected = affected_area_m2 * fraction * mid_unit
    # Widen the unit-cost band by the photo-only uncertainty for the outer bounds.
    low = affected_area_m2 * fraction * low_unit * (1 - _UNCERTAINTY)
    high = affected_area_m2 * fraction * high_unit * (1 + _UNCERTAINTY)

    return CostEstimate(
        currency=currency,
        low=low,
        expected=expected,
        high=high,
        assumptions={
            "level": level,
            "rebuild_fraction": fraction,
            "affected_area_m2": affected_area_m2,
            "unit_cost_low_per_m2": low_unit,
            "unit_cost_high_per_m2": high_unit,
            "uncertainty_band": _UNCERTAINTY,
        },
    )
