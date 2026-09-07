// The headline band of the printed report: the whole-image verdict, the
// confidence it was stated with, and the four-class scale printed as a legend.
import { useFormatter, useTranslations } from "next-intl";
import { DAMAGE_CLASSES, getDamageClass, type DamageCode } from "@/lib/damage-classes";

export interface ReportVerdictProps {
  classCode: DamageCode;
  /** Confidence of the winning region, 0..1 — the number the result panel states. */
  confidence: number;
  className?: string;
}

// The scale printed as a legend: the regions table below prints class CODES,
// and this is where a code maps to a position on the scale, so every segment
// but the verdict's is dimmed rather than hidden. It is deliberately not
// DamageStrip — that animates from an `initial` state, and this document is
// display:none until the print snapshot is taken, so an animation that never
// ran would print a dimmed strip of its own. Everything on this band is static.
const INACTIVE_SEGMENT_OPACITY = 0.28;

export function ReportVerdict({ classCode, confidence, className }: ReportVerdictProps) {
  const t = useTranslations();
  const format = useFormatter();
  const entry = getDamageClass(classCode);

  return (
    <section
      className={`border border-[color:var(--report-rule)] bg-[color:var(--report-panel)] p-3${
        className ? ` ${className}` : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="flex min-w-0 items-baseline gap-2">
          <span
            className="shrink-0 px-2 py-0.5 font-mono text-[11pt] leading-none text-bg"
            style={{ backgroundColor: entry.color }}
          >
            {entry.code}
          </span>
          <span className="font-display text-[16pt] leading-none font-extrabold uppercase tracking-tight">
            {t(`damageClasses.${entry.key}.name`)}
          </span>
        </h2>
        <p className="flex shrink-0 items-baseline gap-2">
          <span className="text-[7.5pt] uppercase tracking-wider text-[color:var(--report-ink-soft)]">
            {t("report.confidence")}
          </span>
          {/* One fraction digit, like ResultPanel and the photo badge: this IS
              the panel's verdict, so it must not round to a different number. */}
          <span className="font-mono text-[16pt] leading-none">
            {format.number(confidence, { style: "percent", maximumFractionDigits: 1 })}
          </span>
        </p>
      </div>

      <ol className="mt-[2mm] flex gap-[0.5mm]">
        {DAMAGE_CLASSES.map((segment) => {
          const active = segment.code === entry.code;
          return (
            <li key={segment.code} className="min-w-0 flex-1">
              <span
                aria-hidden="true"
                className="block h-[3mm]"
                style={{
                  backgroundColor: segment.color,
                  opacity: active ? 1 : INACTIVE_SEGMENT_OPACITY,
                }}
              />
              <span
                className={`mt-[0.5mm] block font-mono text-[6.5pt] leading-none${
                  active ? "" : " text-[color:var(--report-ink-soft)]"
                }`}
              >
                {segment.code}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-[2mm] text-[8pt]">{t(`damageClasses.${entry.key}.description`)}</p>
      <p className="mt-[1mm] text-[7.5pt] text-[color:var(--report-ink-soft)]">
        {t("report.verdictRule")}
      </p>
    </section>
  );
}
