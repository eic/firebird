"""
WSGI configuration file for Firebird application
"""

# Configuration dictionary for the Flask application
config = {
    "PYROBIRD_DOWNLOAD_IS_DISABLED": False,
    "PYROBIRD_DOWNLOAD_IS_UNRESTRICTED": False,
    "PYROBIRD_CORS_IS_ALLOWED": True,
    "PYROBIRD_DOWNLOAD_PATH": "/home/firebird/firebird_www"
}

# Import the Flask application from pyrobird.server
from pyrobird.server import flask_app as application, configure_flask_app

# Apply the configuration to the firebird flask application
configure_flask_app(config)