import signal
import socket
import subprocess
import sys
import time
import os
import urllib
import urllib.request
import urllib.error


def _test_port():
    """PYROBIRD_TEST_PORT, or a port that is free right now."""
    if os.environ.get("PYROBIRD_TEST_PORT"):
        return int(os.environ["PYROBIRD_TEST_PORT"])
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def test_pyrobird_serve_runs_and_responds():
    port = _test_port()
    proc = subprocess.Popen(
        [sys.executable, "-m", "pyrobird.cli", "serve", "--port", str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=os.environ.copy(),
        text=True  # output is string
    )

    time.sleep(3)

    page_served_ok = False
    status_code = -1

    for try_count in range(15):
        try:
            print(f"Making try: {try_count+1}")
            response = urllib.request.urlopen(f"http://127.0.0.1:{port}", timeout=2)
            status_code = response.getcode()
            if status_code == 200:
                page_served_ok = True
                print(f"Success!")
                break
        except Exception as e:
            print(f"(warn) Error during request: {e}")

        time.sleep(1)

    # what is our server doing?
    if os.name == "nt":
        proc.terminate()
    else:
        os.kill(proc.pid, signal.SIGTERM)

    # What its output was?
    output, _ = proc.communicate(timeout=10)
    print(f"Server output:\n======================================\n{output}")
    # proc.wait(timeout=10)
    # poll_result = proc.poll()
    # if poll_result is not None:
    #     print(f"Server exited(!) with code: {poll_result}")




    # Now should we fail with error:
    if page_served_ok:
        print("Page served ok")
    else:
        print("ERROR: Page not served ok")
        raise Exception(f"Test failed!")


if __name__ == "__main__":
    test_pyrobird_serve_runs_and_responds()



