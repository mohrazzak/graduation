// The four-class scale spelled out: what each code on this page means.
//
// The verdict band prints the scale as a strip and the regions table prints
// bare codes, so without this a reader who does not already know the scale can
// see WHERE the verdict sits but not WHAT any class is. A printed report leaves
// the app behind — it has to carry its own key.
import { useTranslations } from "next-intl";
import { DAMAGE_CLASSES } from "@/lib/damage-classes";

export interface ReportLegendProps {
  /** Marked so a reader can find the verdict's own row without re-reading it. */
  activeCode: string;
  className?: string;
}

export function ReportLegend({ activeCode, className }: ReportLegendProps) {
  const t = useTranslations();

  return (
    <section className={className}>
      <h2 className="text-[7.5pt] leading-tight uppercase tracking-wider text-[color:var(--report-ink-soft)]">
        {t("report.legend")}
      </h2>
      <dl className="mt-[1.5mm] space-y-[1mm]">
        {DAMAGE_CLASSES.map((entry) => (
          <div key={entry.code} className="flex gap-[1.5mm]">
            <span
              aria-hidden="true"
              className="mt-[0.8mm] h-[2mm] w-[2mm] shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <div className="min-w-0">
              <dt className="flex items-baseline gap-[1.5mm] text-[7.5pt] leading-tight">
                <span className="font-mono">{entry.code}</span>
                <span className={entry.code === activeCode ? "font-bold" : undefined}>
                  {t(`damageClasses.${entry.key}.name`)}
                </span>
              </dt>
              <dd className="text-[7pt] leading-tight text-[color:var(--report-ink-soft)]">
                {t(`damageClasses.${entry.key}.description`)}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
