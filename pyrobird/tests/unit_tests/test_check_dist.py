"""scripts/check_dist.py: wheel and sdist contents, size, and MANIFEST.in rules."""
import importlib.util
import io
import os
import tarfile
import zipfile

import pytest

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(PROJECT_DIR, "scripts", "check_dist.py")


@pytest.fixture(scope="module")
def check_dist():
    spec = importlib.util.spec_from_file_location("check_dist", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_wheel(path, names):
    """A wheel holding `names`; LICENSE goes where setuptools puts license-files."""
    with zipfile.ZipFile(path, "w") as archive:
        for name in names:
            if name == "LICENSE":
                name = "pyrobird-1.0.dist-info/licenses/LICENSE"
            archive.writestr(name, "x")
    return str(path)


def make_sdist(path, names, top="pyrobird-1.0"):
    with tarfile.open(path, "w:gz") as archive:
        for name in names:
            data = b"x"
            info = tarfile.TarInfo(f"{top}/{name}")
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    return str(path)


def test_complete_archives_pass(check_dist, tmp_path):
    wheel = make_wheel(tmp_path / "pyrobird-1.0-py3-none-any.whl", check_dist.REQUIRED_FILES)
    sdist = make_sdist(tmp_path / "pyrobird-1.0.tar.gz", check_dist.REQUIRED_FILES)
    assert check_dist.check_archive(wheel) == []
    assert check_dist.check_archive(sdist) == []
    assert check_dist.main([str(tmp_path)]) == 0


def test_missing_sample_fails(check_dist, tmp_path):
    sample = "pyrobird/server/static/assets/data/example-cherenkov.firebird.json"
    names = [name for name in check_dist.REQUIRED_FILES if name != sample]
    wheel = make_wheel(tmp_path / "pyrobird-1.0-py3-none-any.whl", names)
    problems = check_dist.check_archive(wheel)
    assert problems == [f"pyrobird-1.0-py3-none-any.whl lacks {sample}"]
    assert check_dist.main([wheel]) == 1


@pytest.mark.parametrize("missing", ["LICENSE", "pyrobird/server/static/3rdpartylicenses.txt"])
def test_missing_license_files_fail(check_dist, tmp_path, missing):
    names = [name for name in check_dist.REQUIRED_FILES if name != missing]
    wheel = make_wheel(tmp_path / "pyrobird-1.0-py3-none-any.whl", names)
    sdist = make_sdist(tmp_path / "pyrobird-1.0.tar.gz", names)
    assert check_dist.check_archive(wheel) == [f"pyrobird-1.0-py3-none-any.whl lacks {missing}"]
    assert check_dist.check_archive(sdist) == [f"pyrobird-1.0.tar.gz lacks {missing}"]


def test_wheel_license_is_read_from_dist_info(check_dist, tmp_path):
    wheel = make_wheel(tmp_path / "pyrobird-1.0-py3-none-any.whl", ["LICENSE", "pyrobird/__init__.py"])
    with zipfile.ZipFile(wheel) as archive:
        assert "LICENSE" not in archive.namelist()
    assert check_dist.archive_members(wheel) == {"LICENSE", "pyrobird/__init__.py"}


def test_oversized_archive_fails(check_dist, tmp_path):
    wheel = make_wheel(tmp_path / "pyrobird-1.0-py3-none-any.whl", check_dist.REQUIRED_FILES)
    problems = check_dist.check_archive(wheel, max_bytes=10)
    assert len(problems) == 1 and "the limit is 10 bytes" in problems[0]


def test_no_archive_fails(check_dist, tmp_path):
    assert check_dist.main([str(tmp_path)]) == 1


def test_manifest_rules(check_dist, tmp_path):
    manifest = tmp_path / "MANIFEST.in"
    manifest.write_text(
        "recursive-include pyrobird/server/static *\n"
        "recursive-exclude pyrobird/server/static/assets/data *.firebird.json\n")
    hits = check_dist.manifest_exclusions(str(manifest))
    assert [path for path, _ in hits] == ["pyrobird/server/static/assets/data/example-cherenkov.firebird.json"]


def test_project_manifest_keeps_required_files(check_dist):
    """The MANIFEST.in that ships with pyrobird drops none of the required files."""
    assert check_dist.manifest_exclusions(os.path.join(PROJECT_DIR, "MANIFEST.in")) == []
    assert check_dist.main(["--manifest-only"]) == 0
