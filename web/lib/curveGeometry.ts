// Where a training-curve point sits inside its SVG plot.
//
// Kept out of the chart component and tested here because two of these rules
// are silent when wrong: an un-inverted y axis draws a plausible-looking curve
// upside down, and a flat series divides by zero and writes "NaN" into the
// points attribute, which renders as nothing at all rather than as an error.

/** Plot area in viewBox units. `padY` keeps the stroke off the top and bottom. */
export interface PlotBox {
  readonly width: number;
  readonly height: number;
  readonly padY: number;
}

/** The value range a plot's vertical axis covers. */
export interface CurveScale {
  readonly min: number;
  readonly max: number;
}

/**
 * The range covering every series drawn in one plot.
 *
 * Train and validation share an axis so their gap is readable as a gap; scaling
 * them independently would draw two curves that always appear to converge.
 */
export function curveScale(series: readonly (readonly number[])[]): CurveScale {
  const values = series.flat();
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Horizontal position of a 1-indexed epoch, so epoch 1 sits on the left edge. */
export function epochX(epoch: number, epochs: number, width: number): number {
  if (epochs <= 1) return 0;
  return ((epoch - 1) / (epochs - 1)) * width;
}

// Coordinates are binary fractions, so 55 epochs across 200 units produces
// values like 3.7037037037037037 — thirty digits per point, times six series.
const round = (value: number): number => Number(value.toFixed(2));

/**
 * A `points` attribute for one series, highest value at the top.
 *
 * SVG y grows downward while a loss axis grows upward, so the mapping is
 * inverted on purpose: `max` lands at `padY` and `min` at `height - padY`.
 */
export function polylinePoints(values: readonly number[], scale: CurveScale, box: PlotBox): string {
  const span = scale.max - scale.min;
  const plotHeight = box.height - box.padY * 2;
  return values
    .map((value, index) => {
      const x = epochX(index + 1, values.length, box.width);
      const ratio = span === 0 ? 0.5 : (scale.max - value) / span;
      return `${round(x)},${round(box.padY + ratio * plotHeight)}`;
    })
    .join(" ");
}
