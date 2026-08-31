"use client";
// One place decides how a model is NAMED to a person.
//
// Two surfaces need it and neither can use the other's source. A live result
// carries the name the API sent, which is English-only; a History row carries
// just `model_id`, because Supabase never stored a name. Both ids are routing
// and storage values that must never be renamed, so the label is looked up
// from messages/*.json and the id itself is only ever a last resort.
import { useTranslations } from "next-intl";

/** Model ids a saved analysis row can reference, including retired backends. */
export const KNOWN_MODEL_IDS = ["raed", "mock", "resnet50-phinet", "yolo-cls"] as const;

export type KnownModelId = (typeof KNOWN_MODEL_IDS)[number];

export function isKnownModelId(id: string): id is KnownModelId {
  return (KNOWN_MODEL_IDS as readonly string[]).includes(id);
}

/**
 * Returns a localized display name for a model id.
 *
 * `fallback` is the name the API supplied, used only for a backend this build
 * has no translation for — an unknown id renders as itself rather than
 * throwing on a missing message key.
 */
export function useModelName(): (id: string, fallback?: string) => string {
  const t = useTranslations();
  return (id, fallback) =>
    isKnownModelId(id) ? t(`models.names.${id}`) : (fallback ?? id);
}
