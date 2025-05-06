config = {
    "PYROBIRD_DOWNLOAD_IS_DISABLED": True,
    "PYROBIRD_DOWNLOAD_IS_UNRESTRICTED": False,
    "PYROBIRD_CORS_IS_ALLOWED": True
}

from pyrobird.server import flask_app as application
from pyrobird.server import configure_flask_app

configure_flask_app(config)

