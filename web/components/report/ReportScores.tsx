// The printed detector-score rows: ConfidenceBars' grammar, static and on paper.
// Budget ~26mm tall in an ~86mm column, so every gap is in mm, not rem.
import { useFormatter, useTranslations } from "next-intl";
import { DAMAGE_CLASSES } from "@/lib/damage-classes";
import type { DamageScores } from "@/lib/types";

export interface ReportScoresProps {
  scores: DamageScores;
  className?: string;
}

export function ReportScores({ scores, className }: ReportScoresProps) {
  const t = useTranslations();
  const format = useFormatter();

  return (
    <section className={className}>
      <h2 className="text-[7.5pt] leading-tight uppercase tracking-wider text-[color:var(--report-ink-soft)]">
        {t("report.scores")}
      </h2>
      <ul className="mt-[1.5mm] space-y-[1mm]">
        {DAMAGE_CLASSES.map((entry) => {
          const score = scores[entry.code];
          return (
            <li key={entry.code} className="flex items-center gap-2 leading-tight">
              <span className="w-[10mm] shrink-0 font-mono text-[7.5pt]">{entry.code}</span>
              <span
                aria-hidden="true"
                className="h-[2mm] min-w-0 flex-1 overflow-hidden border border-[color:var(--report-rule)]"
              >
                {/* Width (not scaleX) so the fill grows from the start edge in RTL too. */}
                <span
                  className="block h-full"
                  style={{ backgroundColor: entry.color, width: `${score * 100}%` }}
                />
              </span>
              <span className="w-[14mm] shrink-0 text-end font-mono text-[7.5pt]">
                {format.number(score, { style: "percent", maximumFractionDigits: 1 })}
              </span>
            </li>
          );
        })}
      </ul>
      {/* These are independent per-class maxima, not a distribution; the deleted
          report captioned them "Class probabilities" and that misread is what
          this note exists to prevent. */}
      <p className="mt-[1.5mm] text-[7pt] leading-tight text-[color:var(--report-ink-soft)]">
        {t("report.scoresNote")}
      </p>
    </section>
  );
}
