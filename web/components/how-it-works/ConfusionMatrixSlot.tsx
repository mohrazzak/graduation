// The measured 3x3 confusion matrix. Cell shading is scaled to each row's
// support so the diagonal reads as strength, not as raw class imbalance.
import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { PRIMARY_EVALUATION } from "@/lib/evaluation";
import { DAMAGE_TIERS } from "@/lib/tiers";

// Alpha ceiling for a fully-correct row, as a two-digit hex suffix.
const MAX_ALPHA = 0.75;

function alphaSuffix(fraction: number): string {
  const alpha = Math.round(fraction * MAX_ALPHA * 255);
  return alpha.toString(16).padStart(2, "0");
}

export function ConfusionMatrixSlot() {
  const t = useTranslations("howItWorks.metrics");
  const captionId = "confusion-matrix-caption";
  const { confusion, perTier, name } = PRIMARY_EVALUATION;

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
              {DAMAGE_TIERS.map((col) => {
                const count = confusion[row.code][col.code];
                const support = perTier[row.code].support;
                return (
                  <span
                    key={col.code}
                    className="flex aspect-square items-center justify-center border border-line font-mono text-sm"
                    style={{
                      backgroundColor: `${row.color}${alphaSuffix(count / support)}`,
                    }}
                  >
                    {count}
                  </span>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <figcaption id={captionId} className="mt-3 text-xs text-muted">
        {t("confusionCaption", { model: name })}
      </figcaption>
    </figure>
  );
}
