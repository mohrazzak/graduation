"""Behavioral tests for the pure ControlNet image preparation helpers."""

from __future__ import annotations

import hashlib

import numpy as np
from PIL import Image

from repair.controlnet_core import (
    composite_generated,
    control_edges,
    generation_seed,
    repair_mask,
)


def checkerboard_rgb(size: int) -> Image.Image:
    """Return a high-contrast image whose edges are easy to observe."""
    values = np.indices((size, size)).sum(axis=0) % 2 * 255
    return Image.fromarray(values.astype(np.uint8), mode="L").convert("RGB")


def left_half_mask(size: int) -> Image.Image:
    """Return a hard mask covering the left half of a square image."""
    mask = Image.new("L", (size, size), 0)
    mask.paste(255, (0, 0, size // 2, size))
    return mask


def test_gc_uses_the_full_building_mask() -> None:
    building = Image.new("L", (10, 10), 255)

    assert np.array(repair_mask(building, "GC", (10, 10))).min() == 255


def test_pc_intersects_the_reference_window() -> None:
    actual = np.array(repair_mask(Image.new("L", (10, 10), 255), "PC", (10, 10)))

    assert actual[:, :2].max() == 0
    assert actual[:8, 2:8].min() == 255
    assert actual[9:, :].max() == 0


def test_nc_uses_the_same_bounded_reference_window() -> None:
    actual = np.array(repair_mask(Image.new("L", (10, 10), 255), "NC", (10, 10)))

    assert actual[:, :2].max() == 0
    assert actual[:8, 2:8].min() == 255
    assert actual[9:, :].max() == 0


def test_repair_mask_intersects_the_building_mask() -> None:
    building = Image.new("L", (10, 10), 0)
    building.putpixel((4, 4), 255)

    actual = np.array(repair_mask(building, "PC", (10, 10)))

    assert actual[4, 4] == 255
    assert actual[1, 1] == 0


def test_control_edges_are_blank_inside_the_repair_mask() -> None:
    edges = control_edges(
        checkerboard_rgb(32), Image.new("L", (32, 32), 255), (32, 32)
    )

    assert np.array(edges).max() == 0


def test_control_edges_keep_edges_outside_the_repair_mask() -> None:
    repair = Image.new("L", (32, 32), 0)

    edges = control_edges(checkerboard_rgb(32), repair, (32, 32))

    assert np.array(edges).max() == 255


def test_generation_seed_is_stable_and_sensitive_to_all_inputs() -> None:
    image = b"building-image"
    tier = "PC"
    prompt = "repair the facade"
    expected = int.from_bytes(
        hashlib.sha256(image + tier.encode() + prompt.encode()).digest()[:8], "big"
    ) % 2**31

    assert generation_seed(image, tier, prompt) == expected
    assert generation_seed(image, tier, prompt) == generation_seed(image, tier, prompt)
    assert generation_seed(b"other-image", tier, prompt) != expected
    assert generation_seed(image, "GC", prompt) != expected
    assert generation_seed(image, tier, "repair the windows") != expected


def test_composite_preserves_pixels_outside_the_mask() -> None:
    result = composite_generated(
        Image.new("RGB", (16, 16), "red"),
        Image.new("RGB", (16, 16), "blue"),
        left_half_mask(16),
    )

    assert result.getpixel((15, 8)) == (255, 0, 0)


def test_composite_uses_generated_pixels_inside_the_mask() -> None:
    result = composite_generated(
        Image.new("RGB", (16, 16), "red"),
        Image.new("RGB", (16, 16), "blue"),
        left_half_mask(16),
    )

    assert result.getpixel((0, 8)) == (0, 0, 255)

