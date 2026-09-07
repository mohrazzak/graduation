// The three loss curves of the run that produced the served weights.
//
// This is the section that makes the early stop visible: the marker sits at
// epoch 25 with thirty more epochs drawn after it, so a reader can see that
// training continued and did not improve, rather than taking it on trust.
import { useTranslations } from "next-intl";
import { LossCurve } from "./LossCurve";
import { TRAINING_RUN } from "@/lib/evaluation";

export function TrainingCurves() {
  const tc = useTranslations("howItWorks.metrics.curves");
  const tl = useTranslations("howItWorks.metrics.lossNames");

  return (
    <section className="mt-10">
      <h3 className="font-display text-base font-bold uppercase">{tc("title")}</h3>
      <p className="mt-2 max-w-2xl text-sm text-muted">{tc("intro")}</p>

      <ul className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-px w-6 bg-muted" />
          {tc("train")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-6 bg-hazard" />
          {tc("validation")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-px border-s border-dashed border-hazard" />
          {tc("bestEpoch")}
        </li>
      </ul>

      <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {TRAINING_RUN.losses.map((series) => (
          <LossCurve
            key={series.key}
            series={series}
            bestEpoch={TRAINING_RUN.bestEpoch}
            title={tl(`${series.key}.short`)}
            description={tc("description", {
              name: tl(`${series.key}.long`),
              epochs: TRAINING_RUN.epochs,
              bestEpoch: TRAINING_RUN.bestEpoch,
            })}
          />
        ))}
      </div>

      <p className="mt-5 max-w-2xl text-xs text-muted">{tc("axisNote")}</p>
    </section>
  );
}
