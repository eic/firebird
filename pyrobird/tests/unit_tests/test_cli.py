# Created by: Dmitry Romanov, 2024
# This file is part of Firebird Event Display and is licensed under the LGPLv3.
# See the LICENSE file in the project root for full license information.

import pytest
from unittest.mock import patch
from pyrobird.cli.serve import get_default_host


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
    except ImportError as e:
        assert False, f"Failed to import pyrobird.cli: {e}"


def test_get_default_host():
    """Test get_default_host logic."""
    
    # Case 1: Running in container
    with patch('pyrobird.cli.serve.is_running_in_container', return_value=True):
        assert get_default_host() == '0.0.0.0'
        
    # Case 2: Not running in container
    with patch('pyrobird.cli.serve.is_running_in_container', return_value=False):
        assert get_default_host() is None
