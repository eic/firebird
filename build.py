import os
import shutil
import subprocess
import sys
import argparse
import json
import re

# Identify the script's path
script_path = os.path.dirname(os.path.abspath(__file__))

# Define the paths
firebird_ng_path = os.path.abspath(os.path.join(script_path, 'firebird-ng'))
dist_path = os.path.join(firebird_ng_path, 'dist', 'firebird', 'browser')
static_path = os.path.join(script_path, 'pyrobird', 'pyrobird', 'server', 'static')
doc_path = os.path.join(script_path, 'doc')
dist_doc_path = os.path.join(dist_path, 'assets', 'doc')
package_json_path = os.path.join(firebird_ng_path, 'package.json')
pyrobird_version_path = os.path.join(script_path, 'pyrobird', 'pyrobird', '__version__.py')
pyrobird_path = os.path.join(script_path, 'pyrobird')

# Print the paths
print(f"Script Path:        {script_path}")
print(f"Docs:               {doc_path}")
print(f"Firebird NG:        {firebird_ng_path}")
print(f"NG dist:            {dist_path}")
print(f"NG dist doc:        {dist_doc_path}")
print(f"Flask static Path:  {static_path}")


def update_npm_version(version, is_dry_run):
    """Update version in firebird-ng/package.json"""
    print(f"Updating {package_json_path} to version {version}")
    if not is_dry_run:
        with open(package_json_path, 'r') as f:
            package_data = json.load(f)
        package_data['version'] = version
        with open(package_json_path, 'w') as f:
            json.dump(package_data, f, indent=2)
            f.write('\n')


def update_py_version(version, is_dry_run):
    """Update version in pyrobird/__version__.py"""
    print(f"Updating {pyrobird_version_path} to version {version}")
    if not is_dry_run:
        with open(pyrobird_version_path, 'r') as f:
            content = f.read()
        content = re.sub(
            r'__version__\s*=\s*["\'][^"\']*["\']',
            f'__version__ = "{version}"',
            content
        )
        with open(pyrobird_version_path, 'w') as f:
            f.write(content)


def build_ng(is_dry_run):
    # Angular can start asking
    print("Running build at firebird-ng")
    if is_dry_run:
        return

    # Run `ng build` in script_path/firebird-ng directory
    try:
        proc = subprocess.Popen(
            ["npm", "run", "build"],
            cwd=firebird_ng_path,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )

        for line in proc.stdout:
            print("[ng] " + line, end="")

        proc.wait()
        if proc.returncode:
            sys.exit(proc.returncode)
    except subprocess.CalledProcessError as e:
        print(f"Error running 'build' phase: {e}")
        sys.exit(1)


def test_frontend(is_dry_run):
    """Run headless tests for the Angular frontend"""
    print("Running headless tests for firebird-ng")
    if is_dry_run:
        return

    try:
        proc = subprocess.Popen(
            ["npm", "run", "test:headless"],
            cwd=firebird_ng_path,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )

        for line in proc.stdout:
            print("[ng-test] " + line, end="")

        proc.wait()
        if proc.returncode:
            print(f"Frontend tests failed with exit code {proc.returncode}")
            sys.exit(proc.returncode)
        print("Frontend tests passed!")
    except subprocess.CalledProcessError as e:
        print(f"Error running frontend tests: {e}")
        sys.exit(1)


def test_backend(is_dry_run):
    """Run pytest tests for pyrobird backend"""
    print("Running pytest tests for pyrobird")
    if is_dry_run:
        return

    print(f"Using Python: {sys.executable}")

    try:
        proc = subprocess.Popen(
            [sys.executable, "-m", "pytest", "./tests/unit_tests", "-v"],
            cwd=pyrobird_path,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )

        for line in proc.stdout:
            print("[pytest] " + line, end="")

        proc.wait()
        if proc.returncode:
            print(f"Backend tests failed with exit code {proc.returncode}")
            sys.exit(proc.returncode)
        print("Backend tests passed!")
    except subprocess.CalledProcessError as e:
        print(f"Error running backend tests: {e}")
        sys.exit(1)


def test_all(is_dry_run):
    """Run all tests (frontend and backend)"""
    test_frontend(is_dry_run)
    test_backend(is_dry_run)


def copy_frontend(is_dry_run):
    # Remove all files and folders in script_path/pyrobird/server/static

    if os.path.exists(static_path):
        print(f"Removing existing '{static_path}'")

        if not is_dry_run:
            shutil.rmtree(static_path)

    print(f"mkdir '{static_path}'")
    if not is_dry_run:
        os.makedirs(static_path)

    # Copy all files and directories from script_path/../firebird-ng/dist/firebird to script_path/pyrobird/server/static
    print(f"Copying '{dist_path}' to '{static_path}' ")
    if is_dry_run:
        return

    if os.path.exists(dist_path):
        shutil.copytree(dist_path, static_path, dirs_exist_ok=True)
    else:
        print(f"Source directory {dist_path} does not exist.")
        sys.exit(1)


def copy_docs(is_dry_run):

    # Copy all files and directories from script_path/firebird-ng/dist/firebird to script_path/pyrobird/server/static
    print(f"Copying '{doc_path}' to '{dist_doc_path}' ")

    if not os.path.exists(dist_doc_path):
        print(f"Source directory {doc_path} does not exist.")
        sys.exit(1)

    if not is_dry_run:
        shutil.copytree(doc_path, dist_doc_path, dirs_exist_ok=True)


def main():
    """Main is main! la-la la-la-la"""

    parser = argparse.ArgumentParser(description="Helper script that builds everything and places in the right places")
    parser.add_argument("mode", default="all", help="all, build_ng, cp_ng, doc, test, test_frontend, test_backend")
    parser.add_argument("-d","--dry-run", action="store_true", help="Don't do actual files operations")
    args = parser.parse_args()

    if args.mode in ["all", "build_ng", "build-ng"]:
        build_ng(is_dry_run=args.dry_run)

    if args.mode in ["all", "test"]:
        test_all(is_dry_run=args.dry_run)

    if args.mode in ["test_frontend", "test-frontend"]:
        test_frontend(is_dry_run=args.dry_run)

    if args.mode in ["test_backend", "test-backend"]:
        test_backend(is_dry_run=args.dry_run)

    if args.mode in ["all", "cp_ng"]:
        copy_frontend(is_dry_run=args.dry_run)

if __name__ == "__main__":
    main()
