// Single FastAPI client: ALL frontend -> API traffic goes through here.
// Throws ApiError; components translate by .kind (messages here are developer-facing).
import { getLevel, type DamageLevelId } from "./levels";
import type { Prediction } from "./types";

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
// against the frozen wire contract before handing it to the UI.
export async function predictDamage(file: File | Blob): Promise<Prediction> {
  const form = new FormData();
  form.append("file", file);
  const body = await requestJson(
    "/predict",
    { method: "POST", body: form },
    PREDICT_TIMEOUT_MS,
  );
  return toPrediction(body);
}

// GET /health — reports liveness and whether the mock predictor is active.
export async function getHealth(): Promise<{ status: string; mock: boolean }> {
  const body = await requestJson("/health", { method: "GET" }, HEALTH_TIMEOUT_MS);
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).status !== "string" ||
    typeof (body as Record<string, unknown>).mock !== "boolean"
  ) {
    throw new ApiError(
      "server",
      "GET /health returned a body that violates the API contract",
    );
  }
  const { status, mock } = body as { status: string; mock: boolean };
  return { status, mock };
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

// Validates the untrusted /predict body against the Prediction contract.
// Anything off-shape means the API broke its contract -> "server" error.
function toPrediction(body: unknown): Prediction {
  if (typeof body !== "object" || body === null) {
    throw contractViolation("body is not an object");
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.level !== "number") {
    throw contractViolation("level is missing or not a number");
  }
  let levelId: DamageLevelId;
  try {
    // getLevel both validates (integer 0-5) and narrows to DamageLevelId.
    levelId = getLevel(raw.level).id;
  } catch {
    throw contractViolation(`level ${raw.level} is not an integer 0-5`);
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

  const probabilities = raw.probabilities;
  if (
    !Array.isArray(probabilities) ||
    probabilities.length !== 6 ||
    !probabilities.every(
      (p): p is number => typeof p === "number" && Number.isFinite(p),
    )
  ) {
    throw contractViolation("probabilities is not an array of 6 finite numbers");
  }

  const heatmap = raw.heatmap_base64;
  if (typeof heatmap !== "string" && heatmap !== null) {
    throw contractViolation("heatmap_base64 is not a string or null");
  }

  return {
    level: levelId,
    confidence,
    probabilities,
    heatmap_base64: heatmap,
  };
}

function contractViolation(reason: string): ApiError {
  return new ApiError("server", `POST /predict violated the API contract: ${reason}`);
}
