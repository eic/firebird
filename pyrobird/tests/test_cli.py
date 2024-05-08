# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

import pytest

def raises_value_error():
    raise ValueError("Invalid value")

def test_raises_value_error():
    with pytest.raises(ValueError, match="Invalid value"):
        raises_value_error()
        
def test_import_pyrobird_cli():
    """Test if the pyrobird.cli module can be imported."""
    try:
        from pyrobird import cli
    except ImportError as e:
        assert False, f"Failed to import pyrobird.cli: {e}"
