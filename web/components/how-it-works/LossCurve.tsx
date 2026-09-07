// One training-curve panel: a single loss, train against validation.
//
// Server-rendered inline SVG rather than a chart library — the repo has no
// charting dependency and this needs none. `currentColor` carries the palette
// so the marks use the same `text-*` tokens as everything else.
import { useFormatter } from "next-intl";
import type { LossSeries } from "@/lib/evaluation";
import { curveScale, epochX, polylinePoints } from "@/lib/curveGeometry";

/** viewBox units. The strip below the axis holds the epoch labels. */
const PLOT = { width: 240, height: 96, padY: 10 } as const;
const LABEL_BASELINE = 108;

export interface LossCurveProps {
  readonly series: LossSeries;
  /** 1-indexed epoch whose weights ship; drawn as the vertical marker. */
  readonly bestEpoch: number;
  readonly title: string;
  /** Sentence read instead of the chart by assistive tech. */
  readonly description: string;
}

export function LossCurve({ series, bestEpoch, title, description }: LossCurveProps) {
  const format = useFormatter();
  const epochs = series.train.length;
  const scale = curveScale([series.train, series.validation]);
  const markerX = epochX(bestEpoch, epochs, PLOT.width);
  const range = (value: number) => format.number(value, { maximumFractionDigits: 2 });

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2 border-b border-line pb-2">
        <span className="font-mono text-xs uppercase tracking-wider">{title}</span>
        <span className="font-mono text-[10px] text-muted">
          {range(scale.max)} – {range(scale.min)}
        </span>
      </figcaption>

      <div className="mt-3" dir="ltr">
        <svg
          viewBox={`0 0 ${PLOT.width} ${LABEL_BASELINE + 2}`}
          className="w-full"
          role="img"
          aria-label={description}
        >
          <line
            x1={markerX}
            y1={0}
            x2={markerX}
            y2={PLOT.height}
            className="text-hazard"
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.45}
          />
          <line
            x1={0}
            y1={PLOT.height}
            x2={PLOT.width}
            y2={PLOT.height}
            className="text-line"
            stroke="currentColor"
            strokeWidth={1}
          />
          <polyline
            points={polylinePoints(series.train, scale, PLOT)}
            fill="none"
            className="text-muted"
            stroke="currentColor"
            strokeWidth={1.25}
          />
          <polyline
            points={polylinePoints(series.validation, scale, PLOT)}
            fill="none"
            className="text-hazard"
            stroke="currentColor"
            strokeWidth={1.75}
          />
          <text
            x={0}
            y={LABEL_BASELINE}
            fontSize={9}
            fill="currentColor"
            className="text-muted font-mono"
          >
            {format.number(1)}
          </text>
          <text
            x={markerX}
            y={LABEL_BASELINE}
            fontSize={9}
            textAnchor="middle"
            fill="currentColor"
            className="text-hazard font-mono"
          >
            {format.number(bestEpoch)}
          </text>
          <text
            x={PLOT.width}
            y={LABEL_BASELINE}
            fontSize={9}
            textAnchor="end"
            fill="currentColor"
            className="text-muted font-mono"
          >
            {format.number(epochs)}
          </text>
        </svg>
      </div>
    </figure>
  );
}
