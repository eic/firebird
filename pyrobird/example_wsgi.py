config = {
    "DOWNLOAD_DISABLE": True,
    "DOWNLOAD_IS_UNRESTRICTED": False,
    "DOWNLOAD_ALLOW_CORS": True
}

from pyrobird.server import flask_app as application

application.config.from_mapping(config)
