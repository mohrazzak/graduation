// Single FastAPI client: ALL frontend -> API traffic goes through here.
// Throws ApiError; components translate by .kind (messages here are developer-facing).
import { DAMAGE_TIERS, getTier, type TierCode } from "./tiers";
import type { ModelInfo, Prediction, TierProbabilities } from "./types";

export type ApiErrorKind = "bad_file" | "server" | "network" | "timeout";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PREDICT_TIMEOUT_MS = 30_000;
// A liveness probe that takes longer than this is as good as down.
const HEALTH_TIMEOUT_MS = 5_000;

// Classifies a building photo via POST /predict and validates the response
// against the wire contract before handing it to the UI. An explicit modelId
// selects a backend from the GET /models roster.
export async function predictDamage(
  file: File | Blob,
  modelId?: string,
): Promise<Prediction> {
  const form = new FormData();
  form.append("file", file);
  const path = modelId
    ? `/predict?model=${encodeURIComponent(modelId)}`
    : "/predict";
  const body = await requestJson(
    path,
    { method: "POST", body: form },
    PREDICT_TIMEOUT_MS,
  );
  return toPrediction(body);
}

// GET /models — the classifier roster the picker renders. Unavailable entries
// are included on purpose: the UI disables them with a reason.
export async function getModels(): Promise<ModelInfo[]> {
  const body = await requestJson("/models", { method: "GET" }, HEALTH_TIMEOUT_MS);
  if (typeof body !== "object" || body === null) {
    throw new ApiError("server", "GET /models returned a body that is not an object");
  }
  const raw = (body as Record<string, unknown>).models;
  if (!Array.isArray(raw)) {
    throw new ApiError("server", "GET /models is missing the models array");
  }
  return raw.map(toModelInfo);
}

// GET /health — reports liveness, whether the mock is active, and which model.
export async function getHealth(): Promise<{
  status: string;
  mock: boolean;
  model: string;
}> {
  const body = await requestJson("/health", { method: "GET" }, HEALTH_TIMEOUT_MS);
  if (typeof body !== "object" || body === null) {
    throw new ApiError(
      "server",
      "GET /health returned a body that violates the API contract",
    );
  }
  const raw = body as Record<string, unknown>;
  if (
    typeof raw.status !== "string" ||
    typeof raw.mock !== "boolean" ||
    typeof raw.model !== "string"
  ) {
    throw new ApiError(
      "server",
      "GET /health returned a body that violates the API contract",
    );
  }
  return { status: raw.status, mock: raw.mock, model: raw.model };
}

// Fire-and-forget wake-up call: free-tier hosts put the API to sleep after
// idle minutes, and a cold start takes ~50s — pinging /health on first page
// load hides that behind the user's reading time. No timeout on purpose (the
// request must stay alive long enough to trigger the wake); outcome ignored.
export function warmUpApi(): void {
  void fetch(`${BASE}/health`, { cache: "no-store" }).catch(() => undefined);
}

// Shared transport: fetch with an AbortController timeout and the common
// error mapping (400 -> bad_file, other !ok -> server, abort -> timeout,
// fetch rejection -> network). Returns the unvalidated JSON body.
async function requestJson(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (isAbortError(error)) {
        throw new ApiError("timeout", `${path} did not respond within ${timeoutMs}ms`);
      }
      // fetch rejects with TypeError when the server is unreachable or CORS blocks.
      throw new ApiError("network", `Could not reach the API at ${BASE}${path}`);
    }
    if (!response.ok) {
      const detail = await readDetail(response);
      if (response.status === 400) {
        throw new ApiError("bad_file", detail ?? "The API rejected the file (HTTP 400)");
      }
      throw new ApiError(
        "server",
        detail ?? `The API responded with HTTP ${response.status}`,
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch (error) {
      // The body read is still under the abort signal, so a slow stream
      // surfaces here as an AbortError rather than hanging forever.
      if (isAbortError(error)) {
        throw new ApiError("timeout", `${path} did not respond within ${timeoutMs}ms`);
      }
      throw new ApiError("server", `${path} returned a non-JSON body`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// Pulls FastAPI's {"detail": "..."} out of an error body when present, so the
// server's specific reason (file type, size) survives into the ApiError.
async function readDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
    ) {
      return body.detail;
    }
  } catch {
    // Non-JSON error body — fall back to the status-based message.
  }
  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// Validates one untrusted model entry from /models or /predict.
function toModelInfo(entry: unknown): ModelInfo {
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
function toPrediction(body: unknown): Prediction {
  if (typeof body !== "object" || body === null) {
    throw contractViolation("body is not an object");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.tier !== "string") {
    throw contractViolation("tier is missing or not a string");
  }
  let tier: TierCode;
  try {
    // getTier both validates and narrows to TierCode.
    tier = getTier(raw.tier).code;
  } catch {
    throw contractViolation(`tier ${raw.tier} is not NC, PC, or GC`);
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

  const rawProbabilities = raw.probabilities;
  if (
    typeof rawProbabilities !== "object" ||
    rawProbabilities === null ||
    Array.isArray(rawProbabilities)
  ) {
    throw contractViolation("probabilities is not a tier-keyed object");
  }
  const entries = rawProbabilities as Record<string, unknown>;
  // Build by iterating the scale, so a missing or extra key cannot slip through.
  const probabilities = {} as TierProbabilities;
  for (const { code } of DAMAGE_TIERS) {
    const value = entries[code];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw contractViolation(`probabilities.${code} is missing or not a number`);
    }
    probabilities[code] = value;
  }

  const damagePercent = raw.damage_percent;
  if (
    typeof damagePercent !== "number" ||
    !Number.isFinite(damagePercent) ||
    damagePercent < 0 ||
    damagePercent > 100
  ) {
    throw contractViolation("damage_percent is not a number in 0..100");
  }

  const heatmap = raw.heatmap_base64;
  if (typeof heatmap !== "string" && heatmap !== null && heatmap !== undefined) {
    throw contractViolation("heatmap_base64 is not a string or null");
  }

  return {
    tier,
    confidence,
    probabilities,
    damage_percent: damagePercent,
    model: toModelInfo(raw.model),
    heatmap_base64: typeof heatmap === "string" ? heatmap : null,
  };
}

function contractViolation(reason: string): ApiError {
  return new ApiError("server", `POST /predict violated the API contract: ${reason}`);
}
