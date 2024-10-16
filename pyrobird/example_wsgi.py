config = {
    "DOWNLOAD_IS_DISABLED": True,
    "DOWNLOAD_IS_UNRESTRICTED": False,
    "CORS_IS_ALLOWED": True
}

from pyrobird.server import flask_app as application

application.config.from_mapping(config)
