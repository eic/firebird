import subprocess
import time
import requests
import sys
import os
import signal

def test_pyrobird_serve_runs_and_responds():
    port = 5461
    proc = subprocess.Popen(
        ["pyrobird", "serve", "--port", str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=os.environ.copy(),
        text=True  # output is string
    )

    try:
        server_started = False

        for _ in range(15):
            try:
                response = requests.get(f"http://127.0.0.1:{port}", timeout=2)
                if response.status_code not in (500, 404):
                    server_started = True
                    break
            except Exception:
                pass

            if proc.poll() is not None:
                output = proc.stdout.read()
                assert False, f"pyrobird serve died during startup!\nServer output:\n{output}"
            time.sleep(1)

        if not server_started:
            if proc.poll() is None:
                if os.name == "nt":
                    proc.terminate()
                else:
                    os.kill(proc.pid, signal.SIGTERM)
                proc.wait(timeout=10)
            output = proc.stdout.read()
            assert False, f"pyrobird serve did not start in time.\nServer output:\n{output}"

        time.sleep(3)
        assert proc.poll() is None, "pyrobird serve exited unexpectedly"

    finally:
        if proc.poll() is None:
            if os.name == "nt":
                proc.terminate()
            else:
                os.kill(proc.pid, signal.SIGTERM)
            proc.wait(timeout=10)
