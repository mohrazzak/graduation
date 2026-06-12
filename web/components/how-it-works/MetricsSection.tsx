// How-it-works: evaluation-metrics slots — accuracy stat card, confusion-matrix
// outline, and per-level precision/recall rows. All placeholders, no fake numbers.
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { DAMAGE_LEVELS } from "@/lib/levels";
import { ConfusionMatrixSlot } from "./ConfusionMatrixSlot";
import { PlaceholderTag } from "./PlaceholderTag";

export function MetricsSection() {
  const t = useTranslations();
  const tm = useTranslations("howItWorks.metrics");

  return (
    <section className="py-12">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
          {tm("title")}
        </h2>
        <PlaceholderTag label={tm("placeholderTag")} />
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted">{tm("intro")}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card ticks className="flex flex-col items-start justify-center gap-3">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">
            {tm("accuracyLabel")}
          </span>
          <span className="font-mono text-6xl font-bold text-muted">{tm("pendingValue")}</span>
          <PlaceholderTag label={tm("afterTraining")} />
        </Card>
        <Card>
          <ConfusionMatrixSlot />
        </Card>
      </div>

      <h3 className="mt-10 font-display text-base font-bold uppercase">{tm("perLevelTitle")}</h3>
      <div className="mt-4">
        <div className="grid grid-cols-[1fr_5rem_5rem] gap-4 pb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
          <span>{tm("levelHeader")}</span>
          <span className="text-end">{tm("precision")}</span>
          <span className="text-end">{tm("recall")}</span>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {DAMAGE_LEVELS.map((level) => (
            <li
              key={level.id}
              className="grid grid-cols-[1fr_5rem_5rem] items-center gap-4 py-3"
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="block h-2.5 w-6"
                  style={{ backgroundColor: level.color }}
                />
                <span className="font-mono text-xs text-muted">
                  {t("common.levelDigit", { id: String(level.id) })}
                </span>
                <span className="text-sm">{t(`levels.${level.key}.name`)}</span>
              </span>
              <span className="text-end font-mono text-sm text-muted">{tm("pendingValue")}</span>
              <span className="text-end font-mono text-sm text-muted">{tm("pendingValue")}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
