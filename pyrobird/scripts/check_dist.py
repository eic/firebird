#!/usr/bin/env python3
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.
"""Checks built pyrobird distributions before an upload.

Usage:
    python scripts/check_dist.py dist/                 # every .whl and .tar.gz in dist/
    python scripts/check_dist.py dist/pyrobird-*.whl   # specific files
    python scripts/check_dist.py --manifest-only       # MANIFEST.in rules only, no build needed

For every wheel and sdist it checks that:
- the files the application needs at run time are present, including the
  sample event file that the documentation links to;
- the archive is smaller than PyPI's upload limit (100 MiB unless the
  project was granted more; see --max-bytes).

It also checks that no MANIFEST.in exclusion rule matches a required file.
Exits with 1 when a check fails.
"""
import argparse
import fnmatch
import os
import sys
import tarfile
import zipfile

# PyPI's default upload limit per file
PYPI_MAX_BYTES = 100 * 1024 * 1024

# Paths relative to the project root (the directory of pyproject.toml)
REQUIRED_FILES = (
    "pyrobird/__init__.py",
    "pyrobird/server/__init__.py",
    "pyrobird/data/eic_geo_process_rules.yaml",
    "pyrobird/server/static/index.html",
    "pyrobird/server/static/assets/config.jsonc",
    "pyrobird/server/static/assets/data/example-cherenkov.firebird.json",
)

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def archive_members(path):
    """Returns member paths of a wheel or sdist, relative to the project root."""
    if path.endswith(".whl"):
        with zipfile.ZipFile(path) as archive:
            # A wheel holds the package at its root: 'pyrobird/server/...'
            return {name for name in archive.namelist() if not name.endswith("/")}
    if path.endswith((".tar.gz", ".tgz")):
        with tarfile.open(path, "r:gz") as archive:
            # An sdist holds the project under a top directory: 'pyrobird-1.0/pyrobird/...'
            return {member.name.split("/", 1)[1] for member in archive.getmembers()
                    if member.isfile() and "/" in member.name}
    raise ValueError(f"Not a wheel or an sdist: {path}")


def check_archive(path, required=REQUIRED_FILES, max_bytes=PYPI_MAX_BYTES):
    """Returns a list of problems found in one archive; empty when it passes."""
    problems = []
    size = os.path.getsize(path)
    if size >= max_bytes:
        problems.append(f"{os.path.basename(path)} is {size:,} bytes; the limit is {max_bytes:,} bytes")

    members = archive_members(path)
    for name in required:
        if name not in members:
            problems.append(f"{os.path.basename(path)} lacks {name}")
    return problems


def manifest_exclusions(manifest_path, paths=REQUIRED_FILES):
    """Returns (path, rule) pairs where a MANIFEST.in exclusion rule drops one of `paths`.

    Understands the exclusion commands of the MANIFEST.in template:
    exclude, recursive-exclude, global-exclude and prune. An include rule
    that comes after the exclusion is not taken into account.
    """
    hits = []
    with open(manifest_path) as manifest:
        rules = [line.strip() for line in manifest if line.strip() and not line.strip().startswith("#")]

    for rule in rules:
        words = rule.split()
        command, args = words[0], words[1:]
        for path in paths:
            name = os.path.basename(path)
            if command == "exclude":
                matched = any(fnmatch.fnmatch(path, pattern) for pattern in args)
            elif command == "recursive-exclude" and args:
                directory = args[0].rstrip("/") + "/"
                matched = path.startswith(directory) and any(fnmatch.fnmatch(name, p) for p in args[1:])
            elif command == "global-exclude":
                matched = any(fnmatch.fnmatch(name, pattern) for pattern in args)
            elif command == "prune" and args:
                matched = path.startswith(args[0].rstrip("/") + "/")
            else:
                matched = False
            if matched:
                hits.append((path, rule))
    return hits


def find_archives(targets):
    archives = []
    for target in targets:
        if os.path.isdir(target):
            archives.extend(sorted(os.path.join(target, name) for name in os.listdir(target)
                                   if name.endswith((".whl", ".tar.gz"))))
        else:
            archives.append(target)
    return archives


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check built pyrobird distributions.")
    parser.add_argument("targets", nargs="*", help="Wheels, sdists, or directories that hold them")
    parser.add_argument("--max-bytes", type=int, default=PYPI_MAX_BYTES,
                        help=f"Size limit per archive (default: {PYPI_MAX_BYTES})")
    parser.add_argument("--manifest", default=os.path.join(PROJECT_DIR, "MANIFEST.in"),
                        help="MANIFEST.in to check")
    parser.add_argument("--manifest-only", action="store_true", help="Check MANIFEST.in rules only")
    args = parser.parse_args(argv)

    problems = [f"MANIFEST.in rule '{rule}' excludes {path}"
                for path, rule in manifest_exclusions(args.manifest)]

    if not args.manifest_only:
        archives = find_archives(args.targets)
        if not archives:
            problems.append("No wheel or sdist to check")
        for archive in archives:
            archive_problems = check_archive(archive, max_bytes=args.max_bytes)
            problems.extend(archive_problems)
            if not archive_problems:
                size = os.path.getsize(archive)
                print(f"OK {os.path.basename(archive)}: {size:,} bytes, "
                      f"{args.max_bytes - size:,} bytes below the limit")

    for problem in problems:
        print(f"FAIL {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
