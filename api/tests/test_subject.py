"""Subject isolation: the cut-out handed to Tripo instead of the raw frame.

These run on synthetic images and a monkeypatched segmenter, so the suite stays
on the mock roster and never loads transformers.
"""

from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image, ImageDraw

from jobs import stages, subject
from predict.damage_classes import Box


def _png(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _scene(width: int = 400, height: int = 200) -> bytes:
    """A wide frame whose 'building' is a dark block on the left third."""
    image = Image.new("RGB", (width, height), (200, 220, 255))
    image.paste(Image.new("RGB", (120, 140), (90, 90, 88)), (20, 30))
    return _png(image)


def _open(data: bytes) -> Image.Image:
    return Image.open(BytesIO(data))


def _silhouette(size: tuple[int, int]) -> Image.Image:
    """A non-rectangular mask. A rectangle would be a crop, not a matte."""
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size[0] - 1, size[1] - 1), fill=255)
    return mask


def _is_matted(out: Image.Image) -> bool:
    """Whether the subject itself was cut out, ignoring the transparent margin.

    The canvas margin is always transparent by design, so a plain `getextrema`
    on the alpha would report every image as matted.
    """
    alpha = out.getchannel("A")
    inside = alpha.crop(alpha.getbbox())
    return inside.getextrema()[0] < 255


def test_union_box_spans_every_detection() -> None:
    union = subject.union_box(
        [Box(0.1, 0.2, 0.4, 0.5), Box(0.6, 0.05, 0.8, 0.9)]
    )
    assert union == Box(0.1, 0.05, 0.8, 0.9)


def test_union_box_of_nothing_is_none() -> None:
    assert subject.union_box([]) is None


def test_parse_boxes_keeps_valid_and_drops_malformed() -> None:
    parsed = subject.parse_boxes(
        [
            {"x1": 0.1, "y1": 0.1, "x2": 0.5, "y2": 0.6},
            {"x1": 0.5, "y1": 0.1, "x2": 0.2, "y2": 0.6},  # inverted
            {"x1": -1, "y1": 0.1, "x2": 0.9, "y2": 0.6},  # out of range
            {"x1": 0.1, "y1": 0.1},  # incomplete
            "not a box",
        ]
    )
    assert parsed == [Box(0.1, 0.1, 0.5, 0.6)]


def test_parse_boxes_ignores_a_non_list() -> None:
    assert subject.parse_boxes({"x1": 0.1}) == []


def test_crop_follows_the_box_and_drops_the_rest_of_the_frame(monkeypatch) -> None:
    """Without a segmenter the box alone must still shrink a wide scene."""
    monkeypatch.setattr(stages, "has_segmenter", lambda: False)
    out = _open(subject.prepare_subject(_scene(), [Box(0.05, 0.15, 0.35, 0.85)]))
    # 400x200 frame, box padded by 5% -> roughly 124x150 plus the 6% margin.
    assert out.width < 200 and out.height < 200
    assert out.mode == "RGBA"


def test_no_boxes_keeps_the_whole_frame(monkeypatch) -> None:
    monkeypatch.setattr(stages, "has_segmenter", lambda: False)
    out = _open(subject.prepare_subject(_scene(), []))
    assert out.width > out.height  # the original 2:1 frame, only margined


def test_matte_is_skipped_without_a_real_segmenter(monkeypatch) -> None:
    """The classical fallback is an edge map, not a silhouette: never matte it."""
    monkeypatch.setattr(stages, "has_segmenter", lambda: False)
    monkeypatch.setattr(
        stages, "building_mask", lambda image: pytest.fail("segmenter was not checked")
    )
    assert not _is_matted(_open(subject.prepare_subject(_scene(), [])))


def test_a_trustworthy_matte_cuts_the_background_away(monkeypatch) -> None:
    monkeypatch.setattr(stages, "has_segmenter", lambda: True)

    monkeypatch.setattr(stages, "building_mask", lambda image: _silhouette(image.size))
    assert _is_matted(_open(subject.prepare_subject(_scene(), [])))


@pytest.mark.parametrize("coverage", [0.02, 0.20, 0.99])
def test_a_degenerate_matte_is_refused(monkeypatch, coverage: float) -> None:
    """A near-empty, collapse-sized, or all-white mask is refused — crop only.

    0.20 stands for the total-damage case: the segmenter keeps a fragment of a
    rubble field, and uploading that fragment is worse than uploading the crop.
    """
    monkeypatch.setattr(stages, "has_segmenter", lambda: True)

    def band(image: Image.Image) -> Image.Image:
        mask = Image.new("L", image.size, 0)
        mask.paste(255, (0, 0, image.width, max(1, int(image.height * coverage))))
        return mask

    monkeypatch.setattr(stages, "building_mask", band)
    assert not _is_matted(_open(subject.prepare_subject(_scene(), [])))


def test_a_user_selection_overrides_the_segmenter(monkeypatch) -> None:
    monkeypatch.setattr(stages, "has_segmenter", lambda: True)
    monkeypatch.setattr(
        stages, "building_mask", lambda image: pytest.fail("selection was ignored")
    )
    selection = _silhouette((400, 200))
    assert _is_matted(_open(subject.prepare_subject(_scene(), [], _png(selection))))


def test_an_unreadable_selection_falls_back_instead_of_failing(monkeypatch) -> None:
    monkeypatch.setattr(stages, "has_segmenter", lambda: False)
    out = _open(subject.prepare_subject(_scene(), [], b"not a png"))
    assert out.mode == "RGBA"


def test_the_subject_is_centred_on_its_canvas(monkeypatch) -> None:
    monkeypatch.setattr(stages, "has_segmenter", lambda: False)
    out = _open(subject.prepare_subject(_scene(200, 200), []))
    assert out.width == out.height  # a square source stays square
    assert out.width > 200  # the margin was added around it


def test_an_oversized_subject_is_capped(monkeypatch) -> None:
    monkeypatch.setattr(stages, "has_segmenter", lambda: False)
    out = _open(subject.prepare_subject(_scene(4000, 3000), []))
    assert max(out.size) == subject.MAX_SUBJECT_SIDE


def test_an_undecodable_source_is_named_not_swallowed() -> None:
    with pytest.raises(subject.SubjectPreparationError):
        subject.prepare_subject(b"not an image", [])


def test_a_selection_is_cropped_with_the_box_not_stretched_onto_it(
    monkeypatch,
) -> None:
    """A selection shares the photo's origin, so the box window must crop it.

    Here the user selected the RIGHT half while the box keeps the LEFT half:
    almost none of the selection falls inside the kept window, so no trustworthy
    matte remains. Resizing the selection onto the crop instead would drag that
    right-half shape over the left-half building — the exact mis-targeting this
    module exists to prevent.
    """
    monkeypatch.setattr(stages, "has_segmenter", lambda: True)
    monkeypatch.setattr(
        stages, "building_mask", lambda image: pytest.fail("selection was ignored")
    )
    selection = Image.new("L", (400, 200), 0)
    selection.paste(255, (200, 0, 400, 200))
    out = _open(
        subject.prepare_subject(_scene(), [Box(0.0, 0.0, 0.5, 1.0)], _png(selection))
    )
    assert not _is_matted(out)


def test_a_selection_of_the_wrong_size_is_refused(monkeypatch) -> None:
    """A mask that cannot be aligned is worse than no mask at all."""
    monkeypatch.setattr(stages, "has_segmenter", lambda: False)
    mismatched = _silhouette((80, 40))
    out = _open(subject.prepare_subject(_scene(), [], _png(mismatched)))
    assert not _is_matted(out)
