// How-it-works: evaluation metrics. The headline accuracies are real, measured
// on the same three-class validation split. Per-tier precision/recall stay
// pending until a per-class evaluation is exported — no fabricated numbers.
import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { MODEL_EVALUATIONS, PRIMARY_EVALUATION } from "@/lib/evaluation";
import { DAMAGE_TIERS } from "@/lib/tiers";
import { ConfusionMatrixSlot } from "./ConfusionMatrixSlot";

export function MetricsSection() {
  const t = useTranslations();
  const tm = useTranslations("howItWorks.metrics");
  const format = useFormatter();

  return (
    <section className="py-12">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {tm("title")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{tm("intro")}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card ticks className="flex flex-col justify-center gap-5">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">
            {tm("accuracyLabel")}
          </span>
          <ul className="space-y-4">
            {MODEL_EVALUATIONS.map((model) => (
              <li key={model.id}>
                <span className="font-mono text-4xl font-bold">
                  {format.number(model.accuracy, {
                    style: "percent",
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="ms-3 font-display text-sm font-bold uppercase">
                  {model.name}
                </span>
                <p className="mt-0.5 text-xs text-muted">{model.architecture}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{tm("accuracyNote")}</p>
        </Card>
        <Card>
          <ConfusionMatrixSlot />
        </Card>
      </div>

      <h3 className="mt-10 font-display text-base font-bold uppercase">
        {tm("perLevelTitle", { model: PRIMARY_EVALUATION.name })}
      </h3>
      <div className="mt-4">
        <div className="grid grid-cols-[1fr_5rem_5rem] gap-4 pb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
          <span>{tm("levelHeader")}</span>
          <span className="text-end">{tm("precision")}</span>
          <span className="text-end">{tm("recall")}</span>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {DAMAGE_TIERS.map((tier) => {
            const metrics = PRIMARY_EVALUATION.perTier[tier.code];
            return (
              <li
                key={tier.code}
                className="grid grid-cols-[1fr_5rem_5rem] items-center gap-4 py-3"
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="block h-2.5 w-6"
                    style={{ backgroundColor: tier.color }}
                  />
                  <span className="font-mono text-xs text-muted">{tier.code}</span>
                  <span className="text-sm">{t(`tiers.${tier.key}.name`)}</span>
                  <span className="font-mono text-xs text-muted">
                    {tm("support", { count: metrics.support })}
                  </span>
                </span>
                <span className="text-end font-mono text-sm">
                  {format.number(metrics.precision, {
                    style: "percent",
                    maximumFractionDigits: 1,
                  })}
                </span>
                <span className="text-end font-mono text-sm">
                  {format.number(metrics.recall, {
                    style: "percent",
                    maximumFractionDigits: 1,
                  })}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 max-w-2xl text-xs text-muted">{tm("perLevelNote")}</p>
      </div>
    </section>
  );
}
