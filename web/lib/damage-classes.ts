/** Active Raed detector scale, ordered from least to most severe. */
export const DAMAGE_CLASSES = [
  { code: "ND", key: "noDamage", color: "#52C77B" },
  { code: "SMD", key: "slightModerate", color: "#F2C94C" },
  { code: "HVD", key: "heavyVeryHeavy", color: "#F28C28" },
  { code: "TD", key: "totalDamage", color: "#FF3B30" },
] as const;

export type DamageCode = (typeof DAMAGE_CLASSES)[number]["code"];
export type DamageClass = (typeof DAMAGE_CLASSES)[number];

export function getDamageClass(code: string): DamageClass {
  const entry = DAMAGE_CLASSES.find((candidate) => candidate.code === code);
  if (!entry) {
    throw new RangeError(`Damage class must be ND, SMD, HVD or TD, received ${code}`);
  }
  return entry;
}

export function severityOf(code: DamageCode): number {
  return DAMAGE_CLASSES.findIndex((entry) => entry.code === code) + 1;
}

/**
 * Keys of a score map that are not one of the four class codes.
 *
 * The scale is a CLOSED set, and both boundaries that build a score map — the
 * /predict response and the stored analyses row — must agree on that. Sharing
 * one guard is what stops them drifting apart: iterating DAMAGE_CLASSES alone
 * proves the four are present, not that nothing else is, so a body still on the
 * retired NC/PC/GC scale would otherwise be accepted with its extra keys
 * silently dropped and look like a healthy four-class one.
 */
export function strayScaleKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => !DAMAGE_CLASSES.some((entry) => entry.code === key));
}
