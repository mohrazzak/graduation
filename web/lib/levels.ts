// Single source of truth for the 0-5 damage scale. Every badge, bar,
// scale segment, and history strip derives color + i18n key from here.
export type DamageLevelId = 0 | 1 | 2 | 3 | 4 | 5;

export interface DamageLevel {
  readonly id: DamageLevelId;
  readonly key:
    | "intact"
    | "minor"
    | "moderate"
    | "severe"
    | "partialCollapse"
    | "totalDestruction";
  readonly color: string; // ramp hex, applied via inline style (Tailwind cannot generate runtime classes)
}

export const DAMAGE_LEVELS: readonly DamageLevel[] = [
  { id: 0, key: "intact", color: "#22C55E" },
  { id: 1, key: "minor", color: "#A3E635" },
  { id: 2, key: "moderate", color: "#FACC15" },
  { id: 3, key: "severe", color: "#F97316" },
  { id: 4, key: "partialCollapse", color: "#EF4444" },
  { id: 5, key: "totalDestruction", color: "#991B1B" },
] as const;

export const ALERT_LEVEL_THRESHOLD: DamageLevelId = 4; // L4-L5 get the hazard banner + alert treatment

// Validates untrusted numbers (API responses, DB rows) into a scale entry.
export function getLevel(id: number): DamageLevel {
  // Indexing alone would also reject non-integers (undefined), but the
  // explicit check keeps intent obvious and the error message honest.
  const level = Number.isInteger(id) ? DAMAGE_LEVELS[id] : undefined;
  if (level === undefined) {
    throw new RangeError(`Damage level id must be an integer 0-5, received ${id}`);
  }
  return level;
}

export function isAlertLevel(id: DamageLevelId): boolean {
  return id >= ALERT_LEVEL_THRESHOLD;
}
