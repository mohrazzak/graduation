// How-it-works: how well the shipped detector performs.
//
// Every number comes from lib/evaluation.ts, which reads them off the served
// checkpoint. The explainer is not decoration: a reader arriving from the old
// page saw "74.66% accuracy" and will read a lower-looking mAP as a worse
// model unless told these measure different things.
import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { PRIMARY_EVALUATION } from "@/lib/evaluation";

export function MetricsSection() {
  const tm = useTranslations("howItWorks.metrics");
  const format = useFormatter();
  const { architecture, epochs, imageSize, metrics } = PRIMARY_EVALUATION;
  const headline = metrics.find((metric) => metric.headline) ?? metrics[0];
  const rest = metrics.filter((metric) => metric !== headline);

  return (
    <section className="py-12">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight">
        {tm("title")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{tm("intro")}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card ticks className="flex flex-col justify-center gap-4">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">
            {tm(`names.${headline?.key ?? "map50"}`)}
          </span>
          <span className="font-mono text-5xl font-bold">
            {format.number(headline?.value ?? 0, {
              style: "percent",
              maximumFractionDigits: 2,
            })}
          </span>
          <p className="text-xs text-muted">
            {tm("architecture", { architecture, epochs, imageSize })}
          </p>
        </Card>

        <Card>
          <h3 className="font-display text-base font-bold uppercase">
            {tm("breakdownTitle")}
          </h3>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {rest.map((metric) => (
              <li
                key={metric.key}
                className="flex items-baseline justify-between gap-4 py-3"
              >
                <span className="text-sm">{tm(`names.${metric.key}`)}</span>
                <span className="font-mono text-sm">
                  {format.number(metric.value, {
                    style: "percent",
                    maximumFractionDigits: 2,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="mt-6 max-w-2xl text-xs text-muted">{tm("detectionNote")}</p>
    </section>
  );
}
