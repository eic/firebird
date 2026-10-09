# test_dex_schema.py - validates DEX producers and repo samples against the
# published JSON Schema (dex-schema/firebird-dex-v1.schema.json).
#
# The hand-rolled structural validator (pyrobird.dex.validate_dex) checks rules
# the schema cannot express (column lengths vs count, ref ranges); this file
# guards the OTHER direction: the schema document itself stays in sync with
# what the converters emit. Skips cleanly outside the monorepo checkout
# (pip-installed pyrobird has no dex-schema/ directory).

import json
import os

import pytest
import uproot

jsonschema = pytest.importorskip("jsonschema")

# Repo layout: <repo>/pyrobird/tests/unit_tests/this_file -> <repo>/dex-schema/
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SCHEMA_FILE = os.path.join(REPO_ROOT, "dex-schema", "firebird-dex-v1.schema.json")

TEST_EDM4EIC_FILE = os.path.join(os.path.dirname(__file__), 'data', 'reco_2024-09_craterlake_2evt.edm4eic.root')
TEST_EDM4HEP_FILE = os.path.join(os.path.dirname(__file__), 'data', 'k_lambda_10x100_2evt.edm4hep.root')

pytestmark = pytest.mark.skipif(
    not os.path.isfile(SCHEMA_FILE),
    reason="dex-schema/ not present (running outside the monorepo checkout)")


@pytest.fixture(scope="module")
def validator():
    with open(SCHEMA_FILE) as f:
        schema = json.load(f)
    # The schema declares draft 2020-12; check_schema catches a broken schema
    # file itself (the most likely drift after hand edits)
    jsonschema.Draft202012Validator.check_schema(schema)
    return jsonschema.Draft202012Validator(schema)


def assert_valid(validator, document, what):
    errors = sorted(validator.iter_errors(document), key=lambda e: e.json_path)
    assert not errors, f"{what} violates the DEX schema:\n" + "\n".join(
        f"  {error.json_path}: {error.message}" for error in errors[:10])


def test_schema_accepts_edm4eic_converter_output(validator):
    from pyrobird.edm4eic import edm4eic_to_dex_dict
    tree = uproot.open(TEST_EDM4EIC_FILE)['events']
    document = edm4eic_to_dex_dict(tree, [0, 1], origin_info={'file': 'test'})
    assert_valid(validator, document, "edm4eic converter output")


def test_schema_accepts_edm4hep_converter_output(validator):
    from pyrobird.edm4hep import edm4hep_to_dex_dict
    tree = uproot.open(TEST_EDM4HEP_FILE)['events']
    document = edm4hep_to_dex_dict(tree, [0, 1], origin_info={'file': 'test'})
    assert_valid(validator, document, "edm4hep converter output")


def test_schema_accepts_upgraded_004(validator):
    from pyrobird.dex import upgrade_dex
    old_document = {
        "type": "firebird-dex-json",
        "version": "0.04",
        "events": [{
            "id": "event_0",
            "groups": [
                {
                    "name": "Hits", "type": "BoxHit",
                    "hits": [{"pos": [1, 2, 3], "dim": [1, 1, 1], "t": [4, 0], "ed": [0.001, 0]}],
                },
                {
                    "name": "Tracks", "type": "PointTrajectory",
                    "paramColumns": ["theta"], "pointColumns": ["x", "y", "z", "t"],
                    "trajectories": [{"points": [[0, 0, 0, 0], [1, 1, 1, 1]], "params": [0.5]}],
                },
            ],
        }],
    }
    assert_valid(validator, upgrade_dex(old_document), "upgrade_dex output")


@pytest.mark.parametrize("relative_path", [
    "firebird-ng/src/assets/data/example-cherenkov.firebird.json",
    "dd4hep-plugin/test.edm4eic.firebird.json",
])
def test_schema_accepts_repo_samples(validator, relative_path):
    sample_file = os.path.join(REPO_ROOT, relative_path)
    if not os.path.isfile(sample_file):
        pytest.skip(f"{relative_path} not present")
    with open(sample_file) as f:
        assert_valid(validator, json.load(f), relative_path)


def test_schema_rejects_malformed_documents(validator):
    # wrong version
    assert not validator.is_valid({"type": "firebird-dex-json", "version": "0.04", "events": []})
    # piece missing count/columns
    assert not validator.is_valid({
        "type": "firebird-dex-json", "version": "1.0",
        "events": [{"id": 0, "pieces": [{"name": "X", "type": "BoxHit", "version": "1.0"}]}],
    })
    # BoxHit without the required pos/dim columns
    assert not validator.is_valid({
        "type": "firebird-dex-json", "version": "1.0",
        "events": [{"id": 0, "pieces": [{
            "name": "X", "type": "BoxHit", "version": "1.0",
            "count": 0, "columns": {},
        }]}],
    })
    # PointTrajectory without points/pointColumns
    assert not validator.is_valid({
        "type": "firebird-dex-json", "version": "1.0",
        "events": [{"id": 0, "pieces": [{
            "name": "X", "type": "PointTrajectory", "version": "1.0",
            "count": 0, "columns": {},
        }]}],
    })
