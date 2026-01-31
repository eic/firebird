import unittest
from unittest.mock import patch
import os
from pyrobird.utils import is_running_in_container

class TestUtils(unittest.TestCase):
    
    @patch('os.path.exists')
    @patch.dict(os.environ, {}, clear=True)
    def test_is_running_in_container_docker(self, mock_exists):
        # Mock /.dockerenv exists
        mock_exists.side_effect = lambda p: p == '/.dockerenv'
        self.assertTrue(is_running_in_container())
        
    @patch('os.path.exists')
    @patch.dict(os.environ, {'KUBERNETES_SERVICE_HOST': '10.0.0.1'}, clear=True)
    def test_is_running_in_container_k8s(self, mock_exists):
        # Mock /.dockerenv does not exist
        mock_exists.return_value = False
        self.assertTrue(is_running_in_container())
        
    @patch('os.path.exists')
    @patch.dict(os.environ, {'SINGULARITY_NAME': 'my_container'}, clear=True)
    def test_is_running_in_container_singularity(self, mock_exists):
        # Mock /.dockerenv does not exist
        mock_exists.return_value = False
        self.assertTrue(is_running_in_container())
        
    @patch('os.path.exists')
    @patch.dict(os.environ, {'APPTAINER_CONTAINER': 'my_container'}, clear=True)
    def test_is_running_in_container_apptainer(self, mock_exists):
        # Mock /.dockerenv does not exist
        mock_exists.return_value = False
        self.assertTrue(is_running_in_container())
        
    @patch('os.path.exists')
    @patch.dict(os.environ, {}, clear=True)
    def test_is_running_in_container_bare_metal(self, mock_exists):
        # Mock /.dockerenv does not exist
        mock_exists.return_value = False
        self.assertFalse(is_running_in_container())

if __name__ == '__main__':
    unittest.main()
