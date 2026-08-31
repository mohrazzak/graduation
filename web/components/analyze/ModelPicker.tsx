"use client";
// Which classifier runs the next prediction. Unavailable models stay visible
// but disabled with a translated reason — a disabled entry is information, a
// missing one is a mystery.
import { useFormatter, useTranslations } from "next-intl";
import { useModelName } from "@/lib/model-names";
import { useId } from "react";
import type { ModelInfo } from "@/lib/types";

export interface ModelPickerProps {
  models: ModelInfo[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function ModelPicker({ models, value, onChange, disabled = false }: ModelPickerProps) {
  const t = useTranslations();
  const modelName = useModelName();
  const format = useFormatter();
  const selectId = useId();

  if (models.length === 0) return null;

  function label(model: ModelInfo): string {
    const accuracy =
      model.accuracy === null
        ? null
        : t("models.accuracy", {
            value: format.number(model.accuracy, {
              style: "percent",
              maximumFractionDigits: 2,
            }),
          });
    const reason = model.available ? null : t(`models.${model.reason ?? "unavailable"}`);
    const suffix = [accuracy, reason].filter((part) => part !== null).join(" · ");
    const name = modelName(model.id, model.name);
    return suffix ? `${name} — ${suffix}` : name;
  }

  // One option is not a choice: render it as a static label rather than a
  // dropdown that cannot go anywhere.
  if (models.length === 1) {
    const only = models[0];
    if (only === undefined) return null;
    return (
      <p className="flex items-baseline gap-2 text-xs">
        <span className="uppercase tracking-wider text-muted">{t("models.label")}</span>
        <span className="font-mono">{label(only)}</span>
      </p>
    );
  }

  return (
    <p className="flex flex-wrap items-baseline gap-2 text-xs">
      <label htmlFor={selectId} className="uppercase tracking-wider text-muted">
        {t("models.label")}
      </label>
      <select
        id={selectId}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded border border-line bg-surface px-2 py-1 font-mono text-xs text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hazard disabled:opacity-40"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id} disabled={!model.available}>
            {label(model)}
          </option>
        ))}
      </select>
    </p>
  );
}
