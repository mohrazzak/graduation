// Single source of truth for the three-tier damage scale. Every badge, bar,
// scale segment, and history strip derives color + i18n key from here.
//
// NC is "non-collapse", NOT "intact": PHI-Net (Task 5, Collapse Mode) defines it
// as "intact or minor damage, structure remains". Never label it as undamaged.
export type TierCode = "NC" | "PC" | "GC";

export interface DamageTier {
  readonly code: TierCode;
  readonly key: "nonCollapse" | "partialCollapse" | "globalCollapse";
  readonly color: string; // ramp hex, applied inline (Tailwind cannot generate runtime classes)
}

// Severity order. Iterate this everywhere; never rely on object key order.
export const DAMAGE_TIERS: readonly DamageTier[] = [
  { code: "NC", key: "nonCollapse", color: "#22C55E" },
  { code: "PC", key: "partialCollapse", color: "#F97316" },
  { code: "GC", key: "globalCollapse", color: "#991B1B" },
] as const;

// Only GC gets the alert color and the hazard stripe.
export const ALERT_TIER: TierCode = "GC";

// Validates untrusted values (API responses, DB rows) into a tier entry.
export function getTier(code: string): DamageTier {
  const tier = DAMAGE_TIERS.find((entry) => entry.code === code);
  if (tier === undefined) {
    throw new RangeError(`Damage tier must be NC, PC, or GC, received ${code}`);
  }
  return tier;
}

export function isAlertTier(code: TierCode): boolean {
  return code === ALERT_TIER;
}
