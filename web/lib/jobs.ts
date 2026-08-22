// The ONLY place the frontend polls the job API. Restoration and 3D take far
// longer than a request, so both are started, then polled until they settle.
import type { DamageCode } from "./damage-classes";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobStage {
  key: string;
  index: number;
  total: number;
}

export interface JobState {
  status: JobStatus;
  stage: JobStage | null;
  /** Artifact names ready to fetch — grows as the pipeline reaches each stage. */
  artifacts: string[];
  /** Message KEY on failure (quota_exceeded, no_api_key, …), never prose. */
  detail: string | null;
  timing: JobTiming;
}

export interface StageTiming {
  key: string;
  status: "running" | "done" | "error";
  elapsed_ms: number;
}

export interface JobTiming {
  elapsed_ms: number;
  stages: StageTiming[];
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_MS = 1500;
// Generation can legitimately run for minutes; give up rather than poll forever.
const MAX_POLL_MS = 6 * 60 * 1000;

export class JobError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "JobError";
  }
}

/** URL of one artifact — used directly as an <img> or <model-viewer> src. */
export function artifactUrl(jobId: string, name: string): string {
  return `${BASE}/jobs/${encodeURIComponent(jobId)}/artifact/${encodeURIComponent(name)}`;
}

async function startJob(path: string, body: FormData): Promise<string> {
  const response = await fetch(`${BASE}${path}`, { method: "POST", body });
  if (!response.ok) {
    throw new JobError(await reasonFrom(response));
  }
  const payload: unknown = await response.json();
  const id = (payload as { job_id?: unknown }).job_id;
  if (typeof id !== "string") {
    throw new JobError("bad_response");
  }
  return id;
}

/** Prepare the automatic building mask that seeds the editor. */
export function startMaskPreparation(file: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  return startJob("/jobs/mask", form);
}

/** Start a 2D restoration through an explicit user-edited mask. */
export function startRepair(
  file: Blob,
  mask: Blob,
  classCode: DamageCode,
  prompt?: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("mask", mask, "selection-mask.png");
  form.append("class_code", classCode);
  if (prompt) form.append("prompt", prompt);
  return startJob("/jobs/repair", form);
}

/** Start a 3D reconstruction from an upload, or from a finished repair job. */
export function startModel3d(
  source: { file: Blob } | { fromJob: string },
): Promise<string> {
  const form = new FormData();
  if ("file" in source) form.append("file", source.file);
  else form.append("from_job", source.fromJob);
  return startJob("/jobs/model3d", form);
}

export function parseJobState(value: unknown): JobState {
  if (typeof value !== "object" || value === null) throw new JobError("bad_response");
  const raw = value as Record<string, unknown>;
  const rawTiming = raw.timing as Record<string, unknown> | null;
  if (!rawTiming || typeof rawTiming.elapsed_ms !== "number" || !Array.isArray(rawTiming.stages)) {
    throw new JobError("bad_response");
  }
  const stage = raw.stage as Record<string, unknown> | null;
  return {
    status: (raw.status as JobStatus) ?? "error",
    stage:
      stage && typeof stage.key === "string"
        ? {
            key: stage.key,
            index: Number(stage.index) || 0,
            total: Number(stage.total) || 0,
          }
        : null,
    artifacts: Array.isArray(raw.artifacts) ? (raw.artifacts as string[]) : [],
    detail: typeof raw.detail === "string" ? raw.detail : null,
    timing: {
      elapsed_ms: Math.max(0, rawTiming.elapsed_ms),
      stages: rawTiming.stages.map((entry) => {
        const item = entry as Record<string, unknown>;
        if (
          typeof item.key !== "string" ||
          !["running", "done", "error"].includes(String(item.status)) ||
          typeof item.elapsed_ms !== "number"
        ) throw new JobError("bad_response");
        return {
          key: item.key,
          status: item.status as StageTiming["status"],
          elapsed_ms: Math.max(0, item.elapsed_ms),
        };
      }),
    },
  };
}

export async function getJob(jobId: string): Promise<JobState> {
  const response = await fetch(`${BASE}/jobs/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new JobError(response.status === 404 ? "job_expired" : "server");
  }
  return parseJobState(await response.json());
}

/**
 * Poll until the job settles, reporting every state change as it happens.
 *
 * Resolves with the final state even on failure, because a failed restoration
 * still carries usable artifacts — the mask and edges are computed locally
 * before generation runs, so they survive a dead API quota.
 */
export async function pollJob(
  jobId: string,
  onState: (state: JobState) => void,
  signal?: AbortSignal,
): Promise<JobState> {
  const deadline = Date.now() + MAX_POLL_MS;
  for (;;) {
    if (signal?.aborted) throw new JobError("aborted");
    const state = await getJob(jobId);
    onState(state);
    if (state.status === "done" || state.status === "error") return state;
    if (Date.now() > deadline) return { ...state, status: "error", detail: "timed_out" };
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function reasonFrom(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Non-JSON error body — fall back to the status.
  }
  return `http_${response.status}`;
}
