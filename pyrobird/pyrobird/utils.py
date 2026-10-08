import ipaddress
import os

# Runtimes that give the process its own network namespace: loopback inside
# the container is not reachable from the host, so the server must bind all
# interfaces to be usable (port publishing decides who reaches it).
ISOLATED_NETWORK_RUNTIMES = ('docker', 'kubernetes')

_APPTAINER_ENV_VARS = ('APPTAINER_NAME', 'APPTAINER_CONTAINER')
_SINGULARITY_ENV_VARS = ('SINGULARITY_NAME', 'SINGULARITY_CONTAINER')


def container_runtime():
    """
    Detects the container runtime the application runs in.

    Apptainer and Singularity are checked first: their images are often built
    from Docker images and still carry `/.dockerenv`, yet they share the host
    network.

    Returns:
        str or None: 'apptainer', 'singularity', 'kubernetes', 'docker',
        or None outside a container.
    """
    if any(var in os.environ for var in _APPTAINER_ENV_VARS):
        return 'apptainer'

    if any(var in os.environ for var in _SINGULARITY_ENV_VARS):
        return 'singularity'

    if 'KUBERNETES_SERVICE_HOST' in os.environ:
        return 'kubernetes'

    if os.path.exists('/.dockerenv'):
        return 'docker'

    return None


def is_running_in_container():
    """
    Detects if the application is running inside a container (Docker, Kubernetes, Singularity, Apptainer).

    Returns:
        bool: True if running in a container, False otherwise.
    """
    return container_runtime() is not None


def is_loopback_host(host):
    """
    Tells whether a bind address only accepts connections from this machine.

    Parameters:
        host (str or None): A host name or IP address. None and '' mean the
            Flask default, 127.0.0.1.

    Returns:
        bool: True for loopback addresses and 'localhost'.
    """
    if not host:
        return True
    host = host.strip().strip('[]')
    if host.lower() == 'localhost':
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        # A host name other than localhost may resolve to any interface
        return False
