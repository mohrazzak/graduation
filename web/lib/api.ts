// Single FastAPI client: ALL frontend -> API traffic goes through here.
// Throws ApiError; components translate by .kind (messages here are developer-facing).
import { ApiError } from "./apiError";
import { parsePrediction, toModelInfo } from "./apiContract";
import type { ModelInfo, Prediction } from "./types";

// Re-exported so every consumer keeps a single import surface: `@/lib/api`.
export { ApiError, type ApiErrorKind } from "./apiError";
export { parsePrediction } from "./apiContract";

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
  return parsePrediction(body);
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
      if (detail === "no_detection") {
        throw new ApiError("no_detection", detail);
      }
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
