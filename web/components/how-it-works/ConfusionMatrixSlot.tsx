// Empty 3x3 confusion-matrix outline: a labeled slot real counts drop into once
// per-class evaluation is exported. Diagonal cells are tinted with each tier's
// ramp color at low opacity.
import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { DAMAGE_TIERS } from "@/lib/tiers";

// ~15% alpha hex suffix — visibly a placeholder tint, never a real value.
const DIAGONAL_TINT_ALPHA = "26";

export function ConfusionMatrixSlot() {
  const t = useTranslations("howItWorks.metrics");
  const captionId = "confusion-matrix-caption";

  return (
    <figure className="mx-auto max-w-md">
      {/* Axis text inside role="img" is replaced by aria-label; the caption carries
          the accessible axis explanation instead. */}
      <div role="img" aria-label={t("confusionTitle")} aria-describedby={captionId}>
        <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted">
          {t("axisPredicted")}
        </p>
        <div className="mt-2 grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1">
          <span className="self-center pe-1 font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("axisActual")}
          </span>
          {DAMAGE_TIERS.map((col) => (
            <span key={col.code} className="text-center font-mono text-[10px] text-muted">
              {col.code}
            </span>
          ))}
          {DAMAGE_TIERS.map((row) => (
            <Fragment key={row.code}>
              <span className="self-center justify-self-center font-mono text-[10px] text-muted">
                {row.code}
              </span>
              {DAMAGE_TIERS.map((col) => (
                <span
                  key={col.code}
                  className="aspect-square border border-line"
                  style={
                    row.code === col.code
                      ? { backgroundColor: `${row.color}${DIAGONAL_TINT_ALPHA}` }
                      : undefined
                  }
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      <figcaption id={captionId} className="mt-3 text-xs text-muted">
        {t("confusionCaption")}
      </figcaption>
    </figure>
  );
}
