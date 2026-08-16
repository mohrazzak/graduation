"use client";
// Runs one job and exposes its live state. Shared by the restoration and 3D
// panels so neither re-implements polling.
import { useCallback, useRef, useState } from "react";
import { JobError, pollJob, type JobState } from "@/lib/jobs";

export interface UseJob {
  jobId: string | null;
  state: JobState | null;
  /** True from the moment a job starts until it settles. */
  running: boolean;
  start: (begin: () => Promise<string>) => Promise<void>;
  reset: () => void;
}

const IDLE: JobState = { status: "queued", stage: null, artifacts: [], detail: null };

export function useJob(): UseJob {
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState<JobState | null>(null);
  const [running, setRunning] = useState(false);
  // Monotonic token: a job the user replaced must not write state afterwards.
  const runRef = useRef(0);

  const start = useCallback(async (begin: () => Promise<string>) => {
    const run = ++runRef.current;
    setRunning(true);
    setState(IDLE);
    setJobId(null);
    try {
      const id = await begin();
      if (run !== runRef.current) return;
      setJobId(id);
      await pollJob(id, (next) => {
        if (run === runRef.current) setState(next);
      });
    } catch (error) {
      if (run !== runRef.current) return;
      setState({
        status: "error",
        stage: null,
        artifacts: [],
        detail: error instanceof JobError ? error.reason : "server",
      });
    } finally {
      if (run === runRef.current) setRunning(false);
    }
  }, []);

  const reset = useCallback(() => {
    runRef.current += 1;
    setJobId(null);
    setState(null);
    setRunning(false);
  }, []);

  return { jobId, state, running, start, reset };
}
