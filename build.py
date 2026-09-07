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


def _run(command, cwd, prefix):
    """Run a subprocess command with output prefixing. Raises on failure."""
    proc = subprocess.Popen(
        command,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    for line in proc.stdout:
        print(f"[{prefix}] " + line, end="")

    proc.wait()
    if proc.returncode:
        raise subprocess.CalledProcessError(proc.returncode, command)


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
    """Build Angular frontend"""
    print("Running build at firebird-ng")
    if is_dry_run:
        return

    _run(["npm", "run", "build"], cwd=firebird_ng_path, prefix="ng")


# Workspace packages with their own vitest suites. The Angular app's builder
# does not see them, so they are run explicitly by their workspace name.
FRONTEND_PACKAGE_WORKSPACES = [
    "@firebird/core",
    "@firebird/root2dex",
]


def test_frontend(is_dry_run):
    """Run headless tests for the Angular frontend and the workspace packages"""
    print("Running headless tests for firebird-ng")
    if is_dry_run:
        return

    _run(["npm", "run", "test:headless"], cwd=firebird_ng_path, prefix="ng-test")

    for workspace in FRONTEND_PACKAGE_WORKSPACES:
        print(f"Running tests for {workspace}")
        _run(["npm", "test", "-w", workspace], cwd=script_path, prefix=workspace.split("/")[-1])

    print("Frontend tests passed!")


def pyrobird_venv_python():
    """Path to the interpreter of pyrobird/.venv, or None if that venv does not exist.

    This is the environment `uv sync` creates inside pyrobird/.
    """
    bin_dir = "Scripts" if os.name == "nt" else "bin"
    venv_python = os.path.join(pyrobird_path, ".venv", bin_dir, "python.exe" if os.name == "nt" else "python")
    return venv_python if os.path.isfile(venv_python) else None


def has_module(python, module):
    """True if `module` can be imported by the given interpreter."""
    return subprocess.call([python, "-c", f"import {module}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0


def pytest_command():
    """Command that runs pytest with pyrobird's dependencies, and a label for the log prefix.

    The interpreter running build.py is a poor default: build.py is usually started with a
    bare system python that has neither pytest nor flask, so the tests used to fail there.

    An existing pyrobird/.venv is used as-is rather than through `uv run`, because `uv run`
    syncs the environment exactly and would uninstall extras that are not part of the test
    run - in particular playwright, which `pyrobird screenshot` needs.
    """
    venv_python = pyrobird_venv_python()
    if venv_python and has_module(venv_python, "pytest"):
        return [venv_python, "-m", "pytest"], venv_python

    # No usable venv yet: let uv build one from pyrobird/uv.lock (pytest lives in the `dev` extra)
    if shutil.which("uv"):
        return ["uv", "run", "--extra", "dev", "python", "-m", "pytest"], "uv run --extra dev"

    return [sys.executable, "-m", "pytest"], sys.executable


def test_backend(is_dry_run):
    """Run pytest tests for pyrobird backend"""
    print("Running pytest tests for pyrobird")
    if is_dry_run:
        return

    command, python_label = pytest_command()
    print(f"Using Python: {python_label}")

    # Fail with an actionable message instead of a bare "No module named pytest"
    if command[0] == sys.executable and not has_module(sys.executable, "pytest"):
        print(f"ERROR: pytest is not installed for {sys.executable}, and uv was not found")
        print("Install the test dependencies:")
        print(f"  cd {pyrobird_path} && uv sync --extra=dev --dev")
        print("Or build without the test steps: build.py notests")
        sys.exit(1)

    _run(command + ["./tests/unit_tests", "-v"], cwd=pyrobird_path, prefix="pytest")
    print("Backend tests passed!")


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


def build_py(is_dry_run):
    """Build pyrobird package using uv"""
    print("Building pyrobird package with uv")
    if is_dry_run:
        return

    _run(["uv", "build"], cwd=pyrobird_path, prefix="uv-build")
    print("Python build completed!")


def publish_py(is_dry_run):
    """Print the command to publish pyrobird package"""
    print("To publish pyrobird package, run:")
    print(f"  cd {pyrobird_path} && uv publish")


USAGE = """Composite modes:
  full      Everything: ng build, all tests, copy into pyrobird, python package
  notests   The same without any test step
  ng        Frontend only: ng build + frontend tests
  py        Python package only: build + publish hint
  test      All tests (frontend and backend), nothing else

Itemized steps:
  build_ng, cp_ng, test_frontend, test_backend, py_build, py_publish"""

# Composite modes and the steps they run, in order. 'notests' is 'full' minus
# the test step, so a build machine without the test dependencies still works.
COMPOSITE_MODES = {
    "full": ["build_ng", "test", "cp_ng", "py_build", "py_publish"],
    "notests": ["build_ng", "cp_ng", "py_build", "py_publish"],
    "ng": ["build_ng", "test_frontend"],
    "py": ["py_build", "py_publish"],
    "test": ["test"],
}

# Old spellings kept working: 'all' is what CI and older docs call the full build
MODE_ALIASES = {
    "all": "full",
    "no-test": "notests",
    "no_test": "notests",
    "build-ng": "build_ng",
    "cp-ng": "cp_ng",
    "test-frontend": "test_frontend",
    "test-backend": "test_backend",
    "py-build": "py_build",
    "py-publish": "py_publish",
}

STEPS = {
    "build_ng": build_ng,
    "test": test_all,
    "test_frontend": test_frontend,
    "test_backend": test_backend,
    "cp_ng": copy_frontend,
    "py_build": build_py,
    "py_publish": publish_py,
}


def main():
    """Main is main! la-la la-la-la"""

    parser = argparse.ArgumentParser(
        description="Helper script that builds everything and places it in the right places",
        epilog=USAGE,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("mode", nargs="*", default="", help="full, notests, ng, py, test, or an itemized step (see below)")
    parser.add_argument("-d", "--dry-run", action="store_true", help="Don't do actual files operations")
    parser.add_argument("-v", "--version", help="Set version for both frontend and pyrobird packages")
    parser.add_argument("--no-test", action="store_true", help="Deprecated: 'full --no-test' is 'notests'")
    args = parser.parse_args()

    # Update versions first if specified
    if args.version:
        update_npm_version(args.version, is_dry_run=args.dry_run)
        update_py_version(args.version, is_dry_run=args.dry_run)

    mode = args.mode[0] if args.mode else ""
    mode = MODE_ALIASES.get(mode, mode)

    steps = COMPOSITE_MODES.get(mode, [mode] if mode in STEPS else None)
    if steps is None:
        print(f"Unknown mode: '{mode}'\n" if mode else "No mode given\n")
        print(USAGE)
        sys.exit(1)

    # 'full --no-test' was the old way to ask for 'notests'. An itemized test_*
    # mode is an explicit request for tests, so the flag does not apply there.
    if args.no_test and mode in COMPOSITE_MODES:
        print("Note: --no-test is deprecated, use: build.py notests")
        steps = [step for step in steps if not step.startswith("test")]

    for step in steps:
        STEPS[step](is_dry_run=args.dry_run)

if __name__ == "__main__":
    main()
