import os
import sys
import subprocess

DIR = os.path.dirname(os.path.abspath(__file__))

failures = []

for filename in os.listdir(DIR):
    if filename.startswith("test_") and filename.endswith(".py") and filename != "run_integration_tests.py":
        fullpath = os.path.join(DIR, filename)
        print(f"Running {filename}...")
        result = subprocess.run([sys.executable, fullpath])
        if result.returncode != 0:
            print(f"FAILED: {filename}")
            failures.append(filename)
        else:
            print(f"PASSED: {filename}")
        print("-" * 40)

if failures:
    print("Some integration tests FAILED:", failures)
    sys.exit(1)
else:
    print("All integration tests passed!")
    sys.exit(0)
