import logging
import os
import click
import pyrobird.server
from pyrobird.server import CFG_DOWNLOAD_IS_UNRESTRICTED, CFG_DOWNLOAD_IS_DISABLED, CFG_DOWNLOAD_PATH, \
    CFG_CORS_IS_ALLOWED, CFG_API_BASE_URL, CFG_FIREBIRD_CONFIG_PATH, CFG_STARTUP_COMMANDS, CFG_REMOTE_HOSTS
from pyrobird.utils import container_runtime, is_loopback_host, ISOLATED_NETWORK_RUNTIMES

# Configure logging
logger = logging.getLogger(__name__)

DEFAULT_PORT = 5454

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

disable_files_help = (
    "Disable all file access: local downloads and conversions, and conversions "
    "of remote http://, https:// and root:// files."
)

remote_hosts_help = (
    "Comma-separated host names that remote conversions (http://, https://, root://) may read from. "
    "An entry that starts with a dot, such as '.jlab.org', also matches its subdomains. "
    "Empty (the default) allows any host. The check covers the requested URL; redirects are followed."
)

host_help = (
    "Address to listen on. Defaults to 127.0.0.1 (this machine only), or 0.0.0.0 inside "
    "Docker and Kubernetes containers. Apptainer and Singularity share the host network, "
    "so they keep 127.0.0.1."
)


def get_default_host():
    """
    Determines the default host based on the environment.

    Docker and Kubernetes containers have their own network namespace, so the
    server binds every interface there. Apptainer and Singularity share the
    host network: loopback already reaches the host browser, and binding all
    interfaces would expose the server to the whole network.

    Returns:
        str: '0.0.0.0' in Docker or Kubernetes, None (Flask's 127.0.0.1) otherwise.
    """
    if container_runtime() in ISOLATED_NETWORK_RUNTIMES:
        return '0.0.0.0'
    return None


def non_loopback_bind_warning(host, port, work_path, unrestricted, disabled):
    """
    Builds the warning for a server that other machines can reach.

    Returns:
        str or None: The warning text, or None for a loopback bind.
    """
    if is_loopback_host(host):
        return None

    if disabled:
        exposure = "File access is disabled (--disable-files)."
    elif unrestricted:
        exposure = ("--allow-any-file is on: every file this user can read is downloadable "
                    "through /api/v1/download.")
    else:
        exposure = (f"Files under the work path {os.path.abspath(work_path or os.getcwd())} "
                    "are downloadable through /api/v1/download.")

    return (f"WARNING: pyrobird listens on {host}:{port}, which other machines can reach. "
            f"{exposure} Pass --host 127.0.0.1 to serve this machine only.")


def make_server_config(unsecure_files=False, allow_cors=False, disable_download=False, work_path="",
                       api_url="", config_path="", startup_commands="", remote_hosts=""):
    """Maps command line options to the Flask config keys that pyrobird.server reads."""
    return {
        CFG_DOWNLOAD_IS_UNRESTRICTED: unsecure_files,
        CFG_DOWNLOAD_IS_DISABLED: disable_download,
        CFG_DOWNLOAD_PATH: work_path,
        CFG_CORS_IS_ALLOWED: allow_cors,
        CFG_API_BASE_URL: api_url,
        CFG_FIREBIRD_CONFIG_PATH: config_path,
        CFG_STARTUP_COMMANDS: startup_commands,
        CFG_REMOTE_HOSTS: remote_hosts,
    }


@click.command()
@click.option("--allow-any-file", "unsecure_files", envvar=CFG_DOWNLOAD_IS_UNRESTRICTED, is_flag=True, show_default=True, default=False, help=unsecure_files_help)
@click.option("--allow-cors", "allow_cors", envvar=CFG_CORS_IS_ALLOWED, is_flag=True, show_default=True, default=False, help=allow_cors_help)
@click.option("--disable-files", "disable_download", envvar=CFG_DOWNLOAD_IS_DISABLED, is_flag=True, show_default=True, default=False, help=disable_files_help)
@click.option("--work-path", "work_path", envvar=CFG_DOWNLOAD_PATH, show_default=True, default="", help="Set the base directory path for file downloads. Defaults to the current working directory.")
@click.option("--remote-hosts", "remote_hosts", envvar=CFG_REMOTE_HOSTS, default="", help=remote_hosts_help)
@click.option("--host", "host", default="", help=host_help)
@click.option("--port", "port", type=int, default=DEFAULT_PORT, show_default=True, help="Set the port for development server to listen to")
@click.option("--api-url", "api_url", envvar=CFG_API_BASE_URL, default="", help="Force to use this address as backend API base URL. E.g. https://my-server:1234/")
@click.option("--config", "config_path", envvar=CFG_FIREBIRD_CONFIG_PATH, default="", help="Path to firebird config.jsonc if used a custom")
@click.option("--startup-commands", "startup_commands", envvar=CFG_STARTUP_COMMANDS, default="",
              help="Commands the frontend runs once the display is ready, "
                   "'type:arg' items separated by ';'. Example: 'open-dex:file.firebird.zip;show-event:2'")
@click.option("--debug", "is_debug", is_flag=True, help="Run flask in debugging mode")
@click.pass_context
def serve(ctx, unsecure_files, allow_cors, disable_download, work_path, remote_hosts, host, port, api_url,
          config_path, startup_commands, is_debug):
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
    if remote_hosts:
        logging.info(f"Remote Hosts Allowed: {remote_hosts}")

    if not host:
        host = get_default_host()

    warning = non_loopback_bind_warning(host, port, work_path, unsecure_files, disable_download)
    if warning:
        click.secho(warning, fg="yellow", bold=True, err=True)

    pyrobird.server.run(debug=is_debug, host=host, port=port, config=make_server_config(
        unsecure_files=unsecure_files,
        allow_cors=allow_cors,
        disable_download=disable_download,
        work_path=work_path,
        api_url=api_url,
        config_path=config_path,
        startup_commands=startup_commands,
        remote_hosts=remote_hosts))


if __name__ == '__main__':
    pyrobird.server.run(debug=True)
