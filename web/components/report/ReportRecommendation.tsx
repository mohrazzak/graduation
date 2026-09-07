// The printed rehabilitation recommendation: what to do about this building,
// laid across the page in one band just above the footer.
import { useTranslations } from "next-intl";
import { getDamageClass, type DamageCode } from "@/lib/damage-classes";

export interface ReportRecommendationProps {
  classCode: DamageCode;
  className?: string;
}

export function ReportRecommendation({ classCode, className }: ReportRecommendationProps) {
  const t = useTranslations();
  const entry = getDamageClass(classCode);
  // The repo's documented way to read an array message from next-intl.
  const items = t.raw(`damageClasses.${entry.key}.recommendation.items`) as string[];

  return (
    <section
      className={`border-t border-[color:var(--report-rule)] pt-2${
        className ? ` ${className}` : ""
      }`}
    >
      <div className="flex items-baseline gap-[2mm]">
        <span
          aria-hidden="true"
          className="h-[2.5mm] w-[2.5mm] shrink-0 self-center"
          style={{ backgroundColor: entry.color }}
        />
        <p className="text-[7.5pt] leading-tight uppercase tracking-wider text-[color:var(--report-ink-soft)]">
          {t("report.recommendation")}
        </p>
        {/* Ink, not the class colour: the screen card colours this heading, but
            it sits on #161619 there. On white #52C77B (ND) fails contrast, so
            on paper the colour moves to the marker and the heading stays ink. */}
        <h2 className="min-w-0 font-display text-[11pt] leading-none font-extrabold uppercase tracking-tight">
          {t(`damageClasses.${entry.key}.recommendation.title`)}
        </h2>
      </div>
      {/* Three columns, so three short items cost one line-height of a page
          that has no second one to spill onto. */}
      <ul className="mt-[2mm] grid grid-cols-3 gap-4">
        {items.map((item) => (
          <li key={item} className="flex gap-[1.5mm] text-[8pt] leading-snug">
            <span
              aria-hidden="true"
              className="mt-[1.2mm] h-px w-[2mm] shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
