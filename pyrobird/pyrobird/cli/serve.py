import logging
import click
import pyrobird.server
from pyrobird.server import CFG_DOWNLOAD_IS_UNRESTRICTED, CFG_DOWNLOAD_IS_DISABLED, CFG_DOWNLOAD_PATH, \
    CFG_CORS_IS_ALLOWED, CFG_API_BASE_URL, CFG_FIREBIRD_CONFIG_PATH

# Configure logging
logger = logging.getLogger(__name__)

unsecure_files_help = (
    "Allow unrestricted access to download files in a system. "
    "When enabled, the server allows downloads of all files which running user has access to. "
    "When disabled only files in `work-path` and subdirectories are allowed. "
    "This option could be safe on personal machines with one user, who runs the server in interactive terminal."
    "(!) It is considered dangerous in all other cases: farms, interactive nodes, production environments, servers, etc. "
)

allow_cors_help = (
    "Enable CORS for downloaded files. This option should be used if you need to support web "
    "applications from different domains accessing the files. Such your server from central firebird server"
)


@click.command()
@click.option("--allow-any-file", "unsecure_files", envvar=CFG_DOWNLOAD_IS_UNRESTRICTED, is_flag=True, show_default=True, default=False, help=unsecure_files_help)
@click.option("--allow-cors", "allow_cors", envvar=CFG_CORS_IS_ALLOWED, is_flag=True, show_default=True, default=False, help=allow_cors_help)
@click.option("--disable-files", "disable_download", envvar=CFG_DOWNLOAD_IS_DISABLED, is_flag=True, show_default=True, default=False, help="Disable all file downloads from the server")
@click.option("--work-path", "work_path", envvar=CFG_DOWNLOAD_PATH, show_default=True, default="", help="Set the base directory path for file downloads. Defaults to the current working directory.")
@click.option("--host", "host", default="", help="Set the host for development server to listen to")
@click.option("--port", "port", default="", help="Set the port for development server to listen to")
@click.option("--api-url", "api_url", envvar=CFG_API_BASE_URL, default="", help="Force to use this address as backend API base URL. E.g. https://my-server:1234/")
@click.option("--config", "config_path", envvar=CFG_FIREBIRD_CONFIG_PATH, default="", help="Path to firebird config.jsonc if used a custom")
@click.option("--debug", "is_debug", is_flag=True, help="Run flask in debugging mode")
@click.pass_context
def serve(ctx, unsecure_files, allow_cors, disable_download, work_path, host, port, api_url, config_path, is_debug):
    """
    Start the server that serves Firebird frontend and can communicate with it.

    This server allows firebird to work with local files and local file system as
    well as to complement frontend features such as open xrootd files, etc.

    This command initializes the Flask server with specific settings for file handling
    and cross-origin resource sharing, tailored to operational and security requirements.

    Examples:
      - Start server with default settings, Firebird works with files in current directory:
          fbd serve
      - Enable unrestricted file downloads (absolute paths allowed) and CORS:
          fbd serve --allow-any-file --allow-cors
      - Set, where firebird will take files from
          fbd serve --work-path=/home/username/datafiles
        Now if you set file local://filename.root in Firebird UI,
        the file /home/username/datafiles/filename.root will be opened
    """

    # Log the state of each flag
    logging.info(f"Unsecure Files Allowed: {unsecure_files}")
    logging.info(f"CORS Allowed: {allow_cors}")
    logging.info(f"File Download Disabled: {disable_download}")
    logging.info(f"Work Path Set To: {work_path if work_path else 'Current Working Directory'}")

    if not host:
        host = None

    if not port:
        port = 5454

    pyrobird.server.run(debug=is_debug, host=host, port=port, config={
        CFG_DOWNLOAD_IS_UNRESTRICTED: unsecure_files,
        CFG_DOWNLOAD_IS_DISABLED: disable_download,
        CFG_DOWNLOAD_PATH: work_path,
        CFG_CORS_IS_ALLOWED: allow_cors,
        CFG_API_BASE_URL: api_url,
        CFG_FIREBIRD_CONFIG_PATH: config_path})


if __name__ == '__main__':
    pyrobird.server.run(debug=True)
