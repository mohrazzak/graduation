// Pre-generated pipeline outputs, committed so a dead API quota degrades the
// demo instead of emptying it (spec §12).
//
// These are REAL outputs produced by the real services — see
// public/fixtures/CREDITS.md for provenance — but they are not live results.
// Anything that shows one MUST label it as a pre-generated example; passing a
// fixture off as live output is the one thing this must never do.

/** Reasons that mean "the service works, it just has no credit right now". */
const EXHAUSTED = new Set(["quota_exceeded", "no_api_key"]);

interface Fixture {
  /** Public path of the pre-generated artifact. */
  readonly src: string;
  /** Upload filename this fixture was generated from. */
  readonly sourceFile: string;
}

// Only the two samples an actual Tripo run covers appear here. SMD and HVD
// have no pre-generated model, so they show the honest "out of credit" state
// rather than a stand-in of some other building.
const MODEL_3D_FIXTURES: readonly Fixture[] = [
  { src: "/fixtures/sample-ND.glb", sourceFile: "sample-ND.jpg" },
  { src: "/fixtures/sample-TD.glb", sourceFile: "sample-TD.jpg" },
] as const;

/**
 * A stand-in 3D model for this upload, or null.
 *
 * Deliberately matched on the exact sample filename rather than falling back to
 * "any fixture": showing a model of a DIFFERENT building would misrepresent the
 * user's photo, which is worse than showing nothing.
 */
export function model3dFixtureFor(
  fileName: string,
  failureReason: string | null,
): string | null {
  if (failureReason === null || !EXHAUSTED.has(failureReason)) return null;
  return MODEL_3D_FIXTURES.find((f) => f.sourceFile === fileName)?.src ?? null;
}
