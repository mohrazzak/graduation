"""Clock-controlled tests for authoritative backend job timing."""

from jobs.store import JobStore


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def test_queued_job_reports_live_total_time() -> None:
    clock = FakeClock()
    store = JobStore(clock=clock)
    job = store.create("repair", 2)
    clock.advance(0.125)

    timing = job.to_status(clock())["timing"]
    assert timing == {"elapsed_ms": 125, "stages": []}


def test_stage_transition_closes_previous_and_keeps_current_live() -> None:
    clock = FakeClock()
    store = JobStore(clock=clock)
    job = store.create("repair", 2)
    store.start_stage(job.id, "mask", 1)
    clock.advance(1.25)
    store.start_stage(job.id, "generate", 2)
    clock.advance(0.5)

    stages = job.to_status(clock())["timing"]["stages"]
    assert stages == [
        {"key": "mask", "status": "done", "elapsed_ms": 1250},
        {"key": "generate", "status": "running", "elapsed_ms": 500},
    ]


def test_finish_freezes_total_and_active_stage_time() -> None:
    clock = FakeClock()
    store = JobStore(clock=clock)
    job = store.create("model3d", 1)
    clock.advance(0.25)
    store.start_stage(job.id, "reconstruct", 1)
    clock.advance(2.0)
    store.finish(job.id)
    clock.advance(8.0)

    timing = job.to_status(clock())["timing"]
    assert timing["elapsed_ms"] == 2250
    assert timing["stages"] == [
        {"key": "reconstruct", "status": "done", "elapsed_ms": 2000}
    ]


def test_fail_closes_active_stage_as_error() -> None:
    clock = FakeClock()
    store = JobStore(clock=clock)
    job = store.create("repair", 1)
    store.start_stage(job.id, "generate", 1)
    clock.advance(0.75)
    store.fail(job.id, "provider_failed")

    timing = job.to_status(clock())["timing"]
    assert timing["elapsed_ms"] == 750
    assert timing["stages"] == [
        {"key": "generate", "status": "error", "elapsed_ms": 750}
    ]


def test_repeating_same_stage_does_not_duplicate_or_reset_it() -> None:
    clock = FakeClock()
    store = JobStore(clock=clock)
    job = store.create("repair", 1)
    store.start_stage(job.id, "generate", 1)
    clock.advance(0.4)
    store.start_stage(job.id, "generate", 1)
    clock.advance(0.1)

    assert job.to_status(clock())["timing"]["stages"] == [
        {"key": "generate", "status": "running", "elapsed_ms": 500}
    ]
