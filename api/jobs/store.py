"""In-process job store for the long-running services.

Restoration and 3D reconstruction take 10 s to 3 min — far past a browser
request — so both run as jobs the client polls.

SCOPE, stated plainly because it matters at the defense: this store is a plain
dictionary guarded by a lock, living inside one uvicorn process. It does not
survive a restart and does not work across replicas. That is the right call for
a single-machine demo and the wrong one for production; swapping it for Redis
would not change any caller, since everything goes through JobStore.
"""

from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

# A finished job's artifacts sit in memory; expire them so a long demo session
# does not grow without bound.
JOB_TTL_SECONDS = 30 * 60


@dataclass
class Artifact:
    """One output of a job — an image, a 3D model — held in memory."""

    data: bytes
    content_type: str


@dataclass
class StageTiming:
    """Measured lifetime of one pipeline stage."""

    key: str
    started_at: float
    ended_at: float | None = None
    status: str = "running"

    def to_status(self, now: float) -> dict[str, object]:
        end = self.ended_at if self.ended_at is not None else now
        return {
            "key": self.key,
            "status": self.status,
            "elapsed_ms": _milliseconds(end - self.started_at),
        }


def _milliseconds(seconds: float) -> int:
    """Convert monotonic seconds without exposing float rounding noise."""
    return max(0, round(seconds * 1000))


@dataclass
class Job:
    """One unit of long-running work and everything the client polls for."""

    id: str
    service: str
    status: str = "queued"  # queued | running | done | error
    stage_key: str | None = None
    stage_index: int = 0
    stage_total: int = 0
    detail: str | None = None
    artifacts: dict[str, Artifact] = field(default_factory=dict)
    created_at: float = field(default_factory=time.monotonic)
    finished_at: float | None = None
    stage_timings: list[StageTiming] = field(default_factory=list)

    def to_status(self, now: float | None = None) -> dict[str, object]:
        """The JSON body GET /jobs/{id} returns."""
        current = time.monotonic() if now is None else now
        end = self.finished_at if self.finished_at is not None else current
        return {
            "status": self.status,
            "stage": (
                None
                if self.stage_key is None
                else {
                    "key": self.stage_key,
                    "index": self.stage_index,
                    "total": self.stage_total,
                }
            ),
            "artifacts": sorted(self.artifacts),
            "detail": self.detail,
            "timing": {
                "elapsed_ms": _milliseconds(end - self.created_at),
                "stages": [stage.to_status(current) for stage in self.stage_timings],
            },
        }


class JobStore:
    """Thread-safe job registry. The pipelines run on worker threads."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._clock = clock

    def create(self, service: str, stage_total: int) -> Job:
        """Register a new queued job and return it."""
        job = Job(
            id=uuid.uuid4().hex,
            service=service,
            stage_total=stage_total,
            created_at=self._clock(),
        )
        with self._lock:
            self._evict_expired()
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        """Return a job by id, or None when unknown or expired."""
        with self._lock:
            self._evict_expired()
            return self._jobs.get(job_id)

    def start_stage(self, job_id: str, key: str, index: int) -> None:
        """Mark the job as running and record which stage it is on.

        Stages are reported as the pipeline genuinely reaches them — the client
        never sees a step that did not run.
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status in ("done", "error"):
                return
            now = self._clock()
            if job.stage_timings and job.stage_timings[-1].status == "running":
                active = job.stage_timings[-1]
                if active.key == key and job.stage_index == index:
                    return
                active.ended_at = now
                active.status = "done"
            job.status = "running"
            job.stage_key = key
            job.stage_index = index
            job.stage_timings.append(StageTiming(key=key, started_at=now))

    def add_artifact(self, job_id: str, name: str, data: bytes, content_type: str) -> None:
        """Attach a finished output, making it fetchable immediately."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.artifacts[name] = Artifact(data=data, content_type=content_type)

    def finish(self, job_id: str) -> None:
        """Mark the job done."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None and job.status not in ("done", "error"):
                now = self._clock()
                self._close_active_stage(job, now, "done")
                job.status = "done"
                job.stage_key = None
                job.finished_at = now

    def fail(self, job_id: str, detail: str) -> None:
        """Mark the job failed with a message the UI can show the user."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None and job.status not in ("done", "error"):
                now = self._clock()
                self._close_active_stage(job, now, "error")
                job.status = "error"
                job.detail = detail
                job.finished_at = now

    @staticmethod
    def _close_active_stage(job: Job, now: float, status: str) -> None:
        """Close the current timing record exactly once. Caller holds the lock."""
        if job.stage_timings and job.stage_timings[-1].status == "running":
            active = job.stage_timings[-1]
            active.ended_at = now
            active.status = status

    def _evict_expired(self) -> None:
        """Drop jobs past the TTL. Caller must hold the lock."""
        cutoff = self._clock() - JOB_TTL_SECONDS
        for job_id in [j for j, job in self._jobs.items() if job.created_at < cutoff]:
            del self._jobs[job_id]


# One store per process, shared by every route.
store = JobStore()
