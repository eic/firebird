import unittest
from unittest.mock import patch
import os

import pytest

from pyrobird.utils import is_running_in_container, container_runtime, is_loopback_host


class TestUtils(unittest.TestCase):

    @patch('os.path.exists')
    @patch.dict(os.environ, {}, clear=True)
    def test_is_running_in_container_docker(self, mock_exists):
        # Mock /.dockerenv exists
        mock_exists.side_effect = lambda p: p == '/.dockerenv'
        self.assertTrue(is_running_in_container())
        self.assertEqual(container_runtime(), 'docker')

    @patch('os.path.exists')
    @patch.dict(os.environ, {'KUBERNETES_SERVICE_HOST': '10.0.0.1'}, clear=True)
    def test_is_running_in_container_k8s(self, mock_exists):
        # Mock /.dockerenv does not exist
        mock_exists.return_value = False
        self.assertTrue(is_running_in_container())
        self.assertEqual(container_runtime(), 'kubernetes')

    @patch('os.path.exists')
    @patch.dict(os.environ, {'SINGULARITY_NAME': 'my_container'}, clear=True)
    def test_is_running_in_container_singularity(self, mock_exists):
        # Mock /.dockerenv does not exist
        mock_exists.return_value = False
        self.assertTrue(is_running_in_container())
        self.assertEqual(container_runtime(), 'singularity')

    @patch('os.path.exists')
    @patch.dict(os.environ, {'APPTAINER_CONTAINER': 'my_container'}, clear=True)
    def test_is_running_in_container_apptainer(self, mock_exists):
        # Mock /.dockerenv does not exist
        mock_exists.return_value = False
        self.assertTrue(is_running_in_container())
        self.assertEqual(container_runtime(), 'apptainer')

    @patch('os.path.exists')
    @patch.dict(os.environ, {'APPTAINER_NAME': 'eic_xl'}, clear=True)
    def test_apptainer_image_built_from_docker(self, mock_exists):
        # An Apptainer image converted from a Docker image still carries /.dockerenv
        mock_exists.side_effect = lambda p: p == '/.dockerenv'
        self.assertEqual(container_runtime(), 'apptainer')

    @patch('os.path.exists')
    @patch.dict(os.environ, {}, clear=True)
    def test_is_running_in_container_bare_metal(self, mock_exists):
        # Mock /.dockerenv does not exist
        mock_exists.return_value = False
        self.assertFalse(is_running_in_container())
        self.assertIsNone(container_runtime())


@pytest.mark.parametrize("host, expected", [
    (None, True),
    ('', True),
    ('localhost', True),
    ('127.0.0.1', True),
    ('127.0.1.1', True),
    ('::1', True),
    ('[::1]', True),
    ('0.0.0.0', False),
    ('::', False),
    ('192.168.1.10', False),
    ('myhost.example.org', False),
])
def test_is_loopback_host(host, expected):
    assert is_loopback_host(host) is expected


if __name__ == '__main__':
    unittest.main()
