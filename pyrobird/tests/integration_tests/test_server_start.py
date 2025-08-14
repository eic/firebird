import signal
import subprocess
import time
import os
import urllib
import urllib.request
import urllib.error


def test_pyrobird_serve_runs_and_responds():
    port = 5461
    proc = subprocess.Popen(
        ["pyrobird", "serve", "--port", str(port)],
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



