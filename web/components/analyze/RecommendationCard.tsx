// The rehabilitation recommendation for a tier: what to do about this building.
// GC is the only tier that gets the alert treatment and the hazard stripe.
import { useTranslations } from "next-intl";
import { CornerTicks } from "@/components/ui/CornerTicks";
import { getDamageClass, type DamageCode } from "@/lib/damage-classes";

export interface RecommendationCardProps {
  classCode: DamageCode;
}

export function RecommendationCard({ classCode }: RecommendationCardProps) {
  const t = useTranslations();
  const entry = getDamageClass(classCode);
  const alert = classCode === "TD";
  const items = t.raw(`damageClasses.${entry.key}.recommendation.items`) as string[];

  return (
    <section
      className={`relative overflow-hidden rounded border bg-surface ${
        alert ? "border-alert/50" : "border-line"
      }`}
    >
      {alert ? (
        <span aria-hidden="true" className="hazard-stripe absolute inset-x-0 top-0" />
      ) : null}
      <div className="relative p-5 sm:p-6">
        <CornerTicks />
        <p className="text-xs uppercase tracking-wider text-muted">
          {t("analyze.recommendation.label")}
        </p>
        <h3
          className={`mt-2 font-display text-lg leading-tight font-extrabold uppercase tracking-tight ${
            alert ? "text-alert" : ""
          }`}
          style={alert ? undefined : { color: entry.color }}
        >
          {t(`damageClasses.${entry.key}.recommendation.title`)}
        </h3>
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-3 text-sm">
              <span
                aria-hidden="true"
                className="mt-2 h-px w-3 shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
