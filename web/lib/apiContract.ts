// Validates untrusted FastAPI response bodies against the shared contract.
//
// A 200 is not a promise about shape. Everything below turns an unknown body
// into a typed value or throws a "server" ApiError naming exactly which field
// broke — a contract violation reported at the boundary is far cheaper to
// diagnose than a TypeError thrown three components later.
//
// Split from api.ts so it stays pure: no fetch, no timeouts, no environment.
import { ApiError } from "./apiError";
import { DAMAGE_CLASSES, getDamageClass, strayScaleKeys } from "./damage-classes";
import type { DamageDetection, DamageScores, ModelInfo, Prediction } from "./types";

// Validates one untrusted model entry from /models or /predict.
export function toModelInfo(entry: unknown): ModelInfo {
  if (typeof entry !== "object" || entry === null) {
    throw contractViolation("a model entry is not an object");
  }
  const raw = entry as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.name !== "string") {
    throw contractViolation("a model entry is missing id or name");
  }
  return {
    id: raw.id,
    name: raw.name,
    accuracy:
      typeof raw.accuracy === "number" && Number.isFinite(raw.accuracy)
        ? raw.accuracy
        : null,
    available: raw.available !== false,
    reason: typeof raw.reason === "string" ? raw.reason : null,
  };
}

// Validates the untrusted /predict body against the Prediction contract.
// Anything off-shape means the API broke its contract -> "server" error.
export function parsePrediction(body: unknown): Prediction {
  if (typeof body !== "object" || body === null) {
    throw contractViolation("body is not an object");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.class_code !== "string") {
    throw contractViolation("class_code is missing or not a string");
  }
  let classCode;
  try {
    classCode = getDamageClass(raw.class_code).code;
  } catch {
    throw contractViolation(`class_code ${raw.class_code} is unknown`);
  }

  const confidence = raw.confidence;
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw contractViolation("confidence is not a number in 0..1");
  }

  const rawScores = raw.scores;
  if (
    typeof rawScores !== "object" ||
    rawScores === null ||
    Array.isArray(rawScores)
  ) {
    throw contractViolation("scores is not a class-keyed object");
  }
  const entries = rawScores as Record<string, unknown>;
  const scores = {} as DamageScores;
  for (const { code } of DAMAGE_CLASSES) {
    const value = entries[code];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      throw contractViolation(`scores.${code} is not a number in 0..1`);
    }
    scores[code] = value;
  }
  // Exactly the scale, not a superset: a body carrying a retired code (PC) or a
  // fifth class would otherwise be accepted with the stray key silently dropped,
  // so a server still on an older scale would look like a healthy four-class one.
  const stray = strayScaleKeys(Object.keys(entries));
  if (stray.length > 0) {
    throw contractViolation(`scores has keys outside the scale: ${stray.join(", ")}`);
  }

  if (!Array.isArray(raw.detections) || raw.detections.length === 0) {
    throw contractViolation("detections is missing or empty");
  }
  const detections: DamageDetection[] = raw.detections.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw contractViolation(`detections.${index} is not an object`);
    }
    const detection = entry as Record<string, unknown>;
    const box = detection.box as Record<string, unknown> | null;
    if (typeof detection.class_code !== "string" || !box) {
      throw contractViolation(`detections.${index} is malformed`);
    }
    // getDamageClass throws a bare RangeError on an off-scale code; convert it
    // so an old-scale response leaves this module as a typed contract error
    // naming the field, like every other violation here.
    let detectedClass;
    try {
      detectedClass = getDamageClass(detection.class_code).code;
    } catch {
      throw contractViolation(
        `detections.${index} class_code ${detection.class_code} is not in the scale`,
      );
    }
    const detectedConfidence = detection.confidence;
    const coordinates = [box.x1, box.y1, box.x2, box.y2];
    if (
      typeof detectedConfidence !== "number" ||
      detectedConfidence < 0 ||
      detectedConfidence > 1 ||
      coordinates.some(
        (value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1,
      ) ||
      (box.x1 as number) > (box.x2 as number) ||
      (box.y1 as number) > (box.y2 as number)
    ) {
      throw contractViolation(`detections.${index} has invalid values`);
    }
    return {
      class_code: detectedClass,
      confidence: detectedConfidence,
      box: {
        x1: box.x1 as number,
        y1: box.y1 as number,
        x2: box.x2 as number,
        y2: box.y2 as number,
      },
    };
  });
  if (scores[classCode] !== confidence) {
    throw contractViolation("confidence does not match the selected class score");
  }

  return {
    class_code: classCode,
    confidence,
    scores,
    detections,
    model: toModelInfo(raw.model),
  };
}

function contractViolation(reason: string): ApiError {
  return new ApiError("server", `POST /predict violated the API contract: ${reason}`);
}
