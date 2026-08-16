"""Batch the demo set: a folder of damaged photos -> repaired images (+ diffs).

One command to build everything the defense needs. For each input photo it writes
``<name>.png`` (the repaired Stage B image) and, unless disabled, ``<name>_triptych.png``
(before | after | change-overlay from Stage D). Resumable — existing outputs are
skipped — and one bad image never kills the run.

    GEMINI_API_KEY=... python -m repair.batch <input_dir> <output_dir> [--level 0-5] [--no-triptych]
"""

from __future__ import annotations

from pathlib import Path

from repair.diff import triptych
from repair.generate import repair_image

_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def run_batch(
    input_dir: Path,
    output_dir: Path,
    *,
    level: int | None = None,
    make_triptych: bool = True,
) -> tuple[int, int]:
    """Repair every image in input_dir into output_dir. Returns (done, failed)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    photos = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in _EXTS)
    if not photos:
        print(f"No images ({', '.join(sorted(_EXTS))}) found in {input_dir}")
        return (0, 0)

    done = failed = 0
    for photo in photos:
        repaired_path = output_dir / f"{photo.stem}.png"
        if repaired_path.exists():
            print(f"skip  {photo.name} (already done)")
            done += 1
            continue
        try:
            original = photo.read_bytes()
            repaired = repair_image(original, level=level)
            repaired_path.write_bytes(repaired)
            if make_triptych:
                tri = triptych(original, repaired)
                (output_dir / f"{photo.stem}_triptych.png").write_bytes(tri)
            print(f"ok    {photo.name} -> {repaired_path.name}")
            done += 1
        except Exception as e:  # one bad image must not abort the batch
            print(f"FAIL  {photo.name}: {type(e).__name__}: {e}")
            failed += 1

    print(f"\nDone: {done} ok, {failed} failed -> {output_dir}")
    return (done, failed)


def _main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Batch-generate repaired demo images.")
    parser.add_argument("input_dir", type=Path, help="folder of damaged photos")
    parser.add_argument("output_dir", type=Path, help="folder to write results")
    parser.add_argument("--level", type=int, default=None, help="damage level 0-5 for all")
    parser.add_argument("--no-triptych", action="store_true", help="skip before/after/diff images")
    args = parser.parse_args()

    run_batch(
        args.input_dir,
        args.output_dir,
        level=args.level,
        make_triptych=not args.no_triptych,
    )


if __name__ == "__main__":
    _main()
