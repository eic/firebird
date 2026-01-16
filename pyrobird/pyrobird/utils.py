import os

def is_running_in_container():
    """
    Detects if the application is running inside a container (Docker, Kubernetes, Singularity, Apptainer).
    
    Returns:
        bool: True if running in a container, False otherwise.
    """
    # Check for Docker
    if os.path.exists('/.dockerenv'):
        return True
        
    # Check for Kubernetes
    if 'KUBERNETES_SERVICE_HOST' in os.environ:
        return True
        
    # Check for Singularity / Apptainer
    # Singularity sets SINGULARITY_NAME or SINGULARITY_CONTAINER
    # Apptainer sets APPTAINER_NAME or APPTAINER_CONTAINER
    container_env_vars = [
        'SINGULARITY_NAME', 
        'SINGULARITY_CONTAINER',
        'APPTAINER_NAME',
        'APPTAINER_CONTAINER'
    ]
    
    if any(var in os.environ for var in container_env_vars):
        return True
        
    return False
