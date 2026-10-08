"""TGeo walking in pyrobird.cern_root and the `pyrobird geo` commands.

The fake ROOT module below mimics PyROOT where it matters: TGeoIterator.Next()
ends with a null proxy that is falsy but not None, and removing a node while
the iterator runs is an error (ROOT crashes).
"""
import os
import subprocess
import sys
import types

import pytest
from click.testing import CliRunner


class NullProxy:
    """PyROOT's stand-in for a null TGeoNode*: falsy, and not None."""

    def __bool__(self):
        return False


class FakeVolume:
    def __init__(self, name, daughters=()):
        self.name = name
        self.daughters = list(daughters)
        self.color = None

    def GetName(self):
        return self.name

    def SetLineColor(self, color):
        self.color = color

    def RemoveNode(self, node):
        if FakeIterator.active:
            raise RuntimeError("RemoveNode while TGeoIterator runs (ROOT crashes here)")
        self.daughters.remove(node)


class FakeNode:
    def __init__(self, name, volume, mother):
        self.name = name
        self.volume = volume
        self.mother = mother

    def GetVolume(self):
        return self.volume

    def GetMotherVolume(self):
        return self.mother


class FakeTString:
    def __init__(self):
        self.value = ""

    def __str__(self):
        return self.value


class FakeIterator:
    active = False

    def __init__(self, top_volume):
        # Depth-first list of (path, level, node), honoring Skip()
        self.top = top_volume
        self.stack = [(f"/{top_volume.name}_1/{n.name}", 1, n) for n in reversed(top_volume.daughters)]
        self.current = None
        self.skip_next = False
        self.skips = 0
        FakeIterator.active = True

    def Next(self):
        if self.current is not None and not self.skip_next:
            path, level, node = self.current
            self.stack.extend((f"{path}/{d.name}", level + 1, d) for d in reversed(node.volume.daughters))
        self.skip_next = False
        if not self.stack:
            FakeIterator.active = False
            self.current = None
            return NullProxy()
        self.current = self.stack.pop()
        return self.current[2]

    def GetPath(self, tstring):
        tstring.value = self.current[0]

    def GetLevel(self):
        return self.current[1]

    def Skip(self):
        self.skip_next = True
        self.skips += 1


class FakeGeoManager:
    def __init__(self, top):
        self.top = top
        self.exported = None

    def GetMasterVolume(self):
        return self.top

    def GetTopVolume(self):
        return self.top

    def GetNNodes(self):
        return 4

    def CleanGarbage(self):
        pass

    def Export(self, file_name):
        self.exported = file_name


def make_geometry():
    """TOP -> DIRC -> DIRCModule_0, DIRCModule_1; TOP -> Other"""
    top = FakeVolume("TOP")
    dirc = FakeVolume("DIRC")
    other = FakeVolume("Other")
    module0 = FakeVolume("DIRCModule_0")
    module1 = FakeVolume("DIRCModule_1")
    dirc_node = FakeNode("DIRC_1", dirc, top)
    other_node = FakeNode("Other_1", other, top)
    dirc.daughters = [FakeNode("DIRCModule_0_1", module0, dirc), FakeNode("DIRCModule_1_1", module1, dirc)]
    top.daughters = [dirc_node, other_node]
    return FakeGeoManager(top)


@pytest.fixture
def fake_root(monkeypatch):
    geo_manager = make_geometry()
    module = types.ModuleType("ROOT")
    module.gErrorIgnoreLevel = 0
    module.kFatal = 6000
    module.kMagenta = 616
    module.TGeoManager = types.SimpleNamespace(Import=lambda file_name: geo_manager)
    module.TGeoIterator = FakeIterator
    module.TString = FakeTString
    # Replace only the ROOT entry: modules imported meanwhile must stay loaded
    monkeypatch.setitem(sys.modules, "ROOT", module)
    yield geo_manager
    FakeIterator.active = False


def test_process_file_walk_ends_on_null_proxy(fake_root):
    from pyrobird.cern_root import tgeo_process_file
    patterns = ["*/DIRCModule_*", "*/Other*"]

    removed = tgeo_process_file("in.root", "out.root", patterns)

    # Each pattern removes the first node it matches; removal waits for the walk to end
    assert removed == ["/TOP_1/DIRC_1/DIRCModule_0_1", "/TOP_1/Other_1"]
    top = fake_root.top
    assert [n.name for n in top.daughters] == ["DIRC_1"]
    assert [n.name for n in top.daughters[0].volume.daughters] == ["DIRCModule_1_1"]
    assert fake_root.exported == "out.root"
    # The caller's list is not modified
    assert patterns == ["*/DIRCModule_*", "*/Other*"]


def test_info_prints_paths_to_depth(fake_root):
    from pyrobird.cern_root import tgeo_info
    lines = []

    printed = tgeo_info("in.root", max_depth=1, echo=lines.append)

    assert printed == 2
    assert lines == ["Top volume: TOP", "Nodes: 4", "1 /TOP_1/DIRC_1", "1 /TOP_1/Other_1"]
    # info never edits the geometry
    assert fake_root.exported is None
    assert len(fake_root.top.daughters) == 2


def test_info_command_does_not_write_files(fake_root, tmp_path, monkeypatch):
    from pyrobird.cli.geo import geo
    monkeypatch.chdir(tmp_path)

    result = CliRunner().invoke(geo, ["info", "detector.root", "--max-depth", "2"])

    assert result.exit_code == 0, result.output
    assert "2 /TOP_1/DIRC_1/DIRCModule_0_1" in result.output
    assert list(tmp_path.iterdir()) == []


def test_process_command_help():
    from pyrobird.cli.geo import geo
    result = CliRunner().invoke(geo, ["process", "--help"])
    assert result.exit_code == 0
    assert "Remove nodes from a TGeo geometry file" in result.output
    assert "YAML rules file" in result.output


# --- Real PyROOT, when the interpreter has it ---------------------------------

MAKE_GEOMETRY = """
import ROOT
ROOT.gErrorIgnoreLevel = ROOT.kFatal
gm = ROOT.TGeoManager("g", "g")
mat = ROOT.TGeoMaterial("Vac", 0, 0, 0)
med = ROOT.TGeoMedium("Vac", 1, mat)
top = gm.MakeBox("TOP", med, 100, 100, 100)
gm.SetTopVolume(top)
dirc = gm.MakeBox("DIRC", med, 10, 10, 10)
module = gm.MakeBox("DIRCModule_0", med, 1, 1, 1)
dirc.AddNode(module, 1)
top.AddNode(dirc, 1)
other = gm.MakeBox("Other", med, 1, 1, 1)
top.AddNode(other, 1)
gm.CloseGeometry()
gm.Export(__import__("sys").argv[1])
# A TGeoManager built in Python crashes ROOT at interpreter teardown
__import__("os")._exit(0)
"""

LIST_PATHS = """
import sys
import ROOT
from pyrobird.cern_root import tgeo_walk
ROOT.gErrorIgnoreLevel = ROOT.kFatal
gm = ROOT.TGeoManager.Import(sys.argv[1])
print("\\n".join(path for path, _, _ in tgeo_walk(gm)))
"""


def _run_python(code, *args):
    # TGeoManager is a process-wide singleton: give each step its own process
    env = dict(os.environ, PYTHONPATH=os.pathsep.join(sys.path))
    return subprocess.run([sys.executable, "-c", code, *args], capture_output=True, text=True,
                          timeout=120, env=env)


def test_process_file_with_pyroot(tmp_path):
    pytest.importorskip("ROOT")
    source = str(tmp_path / "geo.root")
    output = str(tmp_path / "geo.edit.root")
    assert _run_python(MAKE_GEOMETRY, source).returncode == 0

    code = ("import sys; from pyrobird.cern_root import tgeo_process_file; "
            "print(tgeo_process_file(sys.argv[1], sys.argv[2], ['*/DIRCModule_0*']))")
    result = _run_python(code, source, output)
    assert result.returncode == 0, result.stderr
    assert "DIRCModule_0" in result.stdout

    listing = _run_python(LIST_PATHS, output)
    assert listing.returncode == 0, listing.stderr
    paths = listing.stdout.split()
    assert "TOP/DIRC_1" in paths
    assert "TOP/Other_1" in paths
    assert not any("DIRCModule_0" in path for path in paths)


def test_info_depth_with_pyroot(tmp_path):
    pytest.importorskip("ROOT")
    source = str(tmp_path / "geo.root")
    assert _run_python(MAKE_GEOMETRY, source).returncode == 0

    code = ("import sys; from pyrobird.cern_root import tgeo_info; "
            "print('printed', tgeo_info(sys.argv[1], max_depth=int(sys.argv[2])))")
    shallow = _run_python(code, source, "1")
    assert shallow.returncode == 0, shallow.stderr
    assert "printed 2" in shallow.stdout
    assert "DIRCModule_0" not in shallow.stdout

    deep = _run_python(code, source, "2")
    assert "printed 3" in deep.stdout
    assert "2 TOP/DIRC_1/DIRCModule_0_1" in deep.stdout
