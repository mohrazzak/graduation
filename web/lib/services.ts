// What each tier is allowed to do next — Raed's branching rules, in one place.
//
//   NC  restoration is pointless (nothing to rebuild) -> 3D is the primary action
//   PC  the full pipeline, pre-selected: restore, then reconstruct
//   GC  restoration allowed but WARNED: at total collapse the output is a
//       conceptual reconstruction, not a repair plan
import type { DamageCode } from "./damage-classes";

export interface ServicePolicy {
  /** Restoration offered at all? */
  readonly canRestore: boolean;
  /** Opened by default, so the expected path needs no clicks. */
  readonly restorePreselected: boolean;
  /** Show the "this is reconstruction, not repair" warning before running. */
  readonly restoreWarns: boolean;
  /** Restoration is the expected next step, so 3D is secondary. */
  readonly model3dPrimary: boolean;
}

export const SERVICE_POLICY: Readonly<Record<DamageCode, ServicePolicy>> = {
  ND: {
    canRestore: true,
    restorePreselected: true,
    restoreWarns: false,
    model3dPrimary: true,
  },
  SMD: {
    canRestore: true,
    restorePreselected: true,
    restoreWarns: false,
    model3dPrimary: false,
  },
  HVD: {
    canRestore: true,
    restorePreselected: true,
    restoreWarns: false,
    model3dPrimary: false,
  },
  TD: {
    canRestore: true,
    restorePreselected: false,
    restoreWarns: true,
    model3dPrimary: false,
  },
} as const;

export function policyFor(classCode: DamageCode): ServicePolicy {
  return SERVICE_POLICY[classCode];
}
