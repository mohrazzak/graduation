// Empty 6x6 confusion-matrix outline: a labeled slot real counts drop into after
// training. Diagonal cells are tinted with each level's ramp color at low opacity.
import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { DAMAGE_LEVELS } from "@/lib/levels";

// ~15% alpha hex suffix — visibly a placeholder tint, never a real value.
const DIAGONAL_TINT_ALPHA = "26";

export function ConfusionMatrixSlot() {
  const t = useTranslations("howItWorks.metrics");
  const tCommon = useTranslations("common");
  const captionId = "confusion-matrix-caption";

  return (
    <figure className="mx-auto max-w-md">
      {/* Axis text inside role="img" is replaced by aria-label; the caption carries
          the accessible axis explanation instead. */}
      <div
        role="img"
        aria-label={t("confusionTitle")}
        aria-describedby={captionId}
      >
        <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted">
          {t("axisPredicted")}
        </p>
        <div className="mt-2 grid grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-1">
          <span className="self-center pe-1 font-mono text-[10px] uppercase tracking-widest text-muted">
            {t("axisActual")}
          </span>
          {DAMAGE_LEVELS.map((col) => (
            <span key={col.id} className="text-center font-mono text-[10px] text-muted">
              {tCommon("levelDigit", { id: String(col.id) })}
            </span>
          ))}
          {DAMAGE_LEVELS.map((row) => (
            <Fragment key={row.id}>
              <span className="self-center justify-self-center font-mono text-[10px] text-muted">
                {tCommon("levelDigit", { id: String(row.id) })}
              </span>
              {DAMAGE_LEVELS.map((col) => (
                <span
                  key={col.id}
                  className="aspect-square border border-line"
                  style={
                    row.id === col.id
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
