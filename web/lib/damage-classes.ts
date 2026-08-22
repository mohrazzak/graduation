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
