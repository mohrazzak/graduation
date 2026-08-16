"""Both classifier backends must survive in ONE process, in either order.

This guards a crash that no ordinary test can catch: switching from the Keras
backend to the Ultralytics one used to SIGSEGV the interpreter, killing the
whole API rather than failing a request. Because the failure mode is process
death, the check has to run in a subprocess and be judged by exit code.

See predict/registry.py's module docstring for the measured behaviour.
"""

import subprocess
import sys
import textwrap

import pytest

SCRIPT = textwrap.dedent(
    """
    import sys
    # Importing the registry must make the torch stack safe to combine with
    # TensorFlow, whatever order the backends are then used in.
    from predict.registry import get_classifier, ModelUnavailableError

    SAMPLE = "../web/public/samples/sample-PC.jpg"
    with open(SAMPLE, "rb") as fh:
        data = fh.read()

    try:
        resnet = get_classifier("resnet50-phinet")
        yolo = get_classifier("yolo-cls")
    except ModelUnavailableError as exc:
        print("SKIP", exc.reason)
        sys.exit(3)

    # The order that used to kill the process: Keras predicts first, then the
    # Ultralytics backend loads. Then switch back, twice, for good measure.
    print("resnet", resnet.classify(data).tier)
    print("yolo", yolo.classify(data).tier)
    print("resnet", resnet.classify(data).tier)
    print("yolo", yolo.classify(data).tier)
    print("SURVIVED")
    """
)


@pytest.mark.slow
def test_switching_backends_does_not_kill_the_process():
    pytest.importorskip("tensorflow")
    pytest.importorskip("ultralytics")

    result = subprocess.run(
        [sys.executable, "-c", SCRIPT],
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    if result.returncode == 3:
        pytest.skip(f"weights unavailable: {result.stdout.strip()}")

    assert result.returncode != -11, (
        "SIGSEGV: the backends no longer coexist. Check that predict/registry.py "
        "still imports the torch stack (including ultralytics) at module load, "
        "before anything can reach TensorFlow.\n" + result.stderr[-2000:]
    )
    assert result.returncode == 0, result.stderr[-2000:]
    assert "SURVIVED" in result.stdout
