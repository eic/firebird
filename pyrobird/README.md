# pyrobird

[![PyPI - Version](https://img.shields.io/pypi/v/pyrobird.svg)](https://pypi.org/project/pyrobird)
[![PyPI - Python Version](https://img.shields.io/pypi/pyversions/pyrobird.svg)](https://pypi.org/project/pyrobird)

-----

**Table of Contents**

- [Installation](#installation)
- [License](#license)

## Installation

```bash
pip install pyrobird
```

Development installation 

```bash
python -m pip install --editable .[test]
```

## Contributing

- [PEP8](https://peps.python.org/pep-0008/) is required
- [Use Numpy style dockstring comments](https://numpydoc.readthedocs.io/en/latest/format.html)
- [pytest](https://docs.pytest.org/en/latest/) is used for unit tests. Aim for comprehensive coverage of the new code.
- Utilize [type hints](https://docs.python.org/3/library/typing.html) wherever is possible to enhance readability and reduce errors.
- Use of specific exceptions for error handling is better. As described in the [Python documentation](https://docs.python.org/3/tutorial/errors.html) rather than general exceptions.
- Contributions are subject to code review. Please submit pull requests (PRs) against the `main` branch for any contributions.
- Manage dependencies appropriately. Add new dependencies to `pyproject.toml`. Provide a justification for new dependencies

## Testing

To install dependencies with testing libraries included 

```bash
pip install .[test]
```

Navigate to the pyrobird/tests and execute:

```bash
pytest

# To stop immediately on error and enter debugging mode
pytest -x --pdb 
```

## Development install

```
python -m pip install --upgrade --editable  .[test]
```

# Pyrobird Server

This server allows Firebird to work with local files and the local file system as
well as to complement frontend features such as opening XRootD files, etc.

Serve Firobird locally and have access to files in current directory: 

```bash
fbd serve
```

**pyrobird** (backend) allows **Firebird** (frontend) to access certain files on your system. 
For this reason pyrobird server has multiple endpoints such as `/api/v1/download` 
which allows to download files. There are library files served and by default Firebird
has access to files in your current directory or a directory provided via `--work-path` flag


#### **Available Options**

| Option                     | Short | Type    | Default | Description                                                                                                                                                                                                                                   |
|----------------------------|-------|---------|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `--allow-any-file`         |       | Flag    | `False` | Allow unrestricted access to download files in the system. When enabled, the server allows downloads of all files which the running user has access to. **Use with caution**: It is considered dangerous in production environments.            |
| `--allow-cors`             |       | Flag    | `False` | Enable CORS for downloaded files. This option should be used if you need to support web applications from different domains accessing the files, such as serving your server from a central Firebird server.                                       |
| `--disable-files`          |       | Flag    | `False` | Disable all file downloads from the server. This option will prevent any file from being downloaded, enhancing security by restricting file access.                                                                                              |
| `--work-path TEXT`         |       | String  | `CWD`   | Set the base directory path for file downloads. Defaults to the current working directory. Use this option to specify where the server should look for files when handling download requests.                                                       |


> `--allow-any-file` - allows unrestricted access to download files in a system.
> When enabled, the server allows downloads of all files that user has access to.
> When disabled - only files in `--work-path` and its subdirectories are allowed to be downloaded.
> This option could be considered safe on personal machines with a single user, 
> who runs localhost server in a terminal
> 
> (!) It is considered dangerous in all other cases: farms, interactive nodes, production environments, servers, etc.
> Just think `/etc/passwd` will be accessible through  `localhost:port/api/v1/download?f=/etc/passwd`
> 
> So security wise, it is better to use `--work-path` than `--allow-any-file`


- Start server with default settings, Firebird works with files in current directory:
   ```bash
  fbd serve
   ```

- Set where Firebird will take files from:
   
   ```bash
   fbd serve --work-path=/home/username/datafiles
   ```

   Now if you set file `local://filename.root` in Firebird UI,
   the file `/home/username/datafiles/filename.root` will be opened


## API Documentation

This is technical explanation of what is under the hood of the server part

## Features

- **Secure File Downloading**: Download files with access control to prevent unauthorized access.
- **EDM4eic Event Processing**: Extract and convert specific events from EDM4eic files to JSON.
- **Static File Serving**: Serve frontend assets seamlessly alongside API endpoints.
- **Dynamic Configuration**: Serve configuration files with real-time server information.
- **CORS Support**: Enable Cross-Origin Resource Sharing for specified routes.

### Configuration Options
- **DOWNLOAD_PATH**: `str[getcwd()]`, Specifies the directory from which files can be downloaded when using relative paths.
- **DOWNLOAD_DISABLE**: `bool[False]` If set to `True`, all download functionalities are disabled.
- **DOWNLOAD_IS_UNRESTRICTED**: `bool[False]`, allows unrestricted access to download any file, including sensitive ones.
- **DOWNLOAD_ALLOW_CORS**: `bool[False]`, If set to `True`, enables Cross-Origin Resource Sharing (CORS) for download routes.




The API provides endpoints for downloading files, processing EDM4eic events, and serving configuration files. It also includes static file serving for frontend assets.

---

### Download File

#### **Endpoint**

```
GET /api/v1/download
GET /api/v1/download/<path:filename>
```

#### **Description**

Allows users to download specified files. The download can be restricted based on configuration settings to prevent unauthorized access to sensitive files.

#### **Parameters**

- **Query Parameters**:
    - `filename` (optional): The name or path of the file to download.
    - `f` (optional): An alternative parameter for the filename.

- **Path Parameters**:
    - `filename` (optional): The path of the file to download.

**Note**: You can provide the filename either as a query parameter or as part of the URL path.

#### **Usage**

1. **Download via Query Parameter**

   ```bash
   curl -O "http://localhost:5454/api/v1/download?filename=example.txt"
   ```

2. **Download via URL Path**

   ```bash
   curl -O "http://localhost:5454/api/v1/download/example.txt"
   ```

#### **Security Considerations**

- **Access Control**: Ensure that `DOWNLOAD_ALLOW_UNRESTRICTED` is set appropriately to prevent unauthorized access.
- **Path Traversal**: The server sanitizes file paths to prevent directory traversal attacks.

---

### Open EDM4eic Event

#### **Endpoint**

```
GET /api/v1/edm4eic/event/<int:event_number>
GET /api/v1/edm4eic/event/<int:event_number>/<path:filename>
```

#### **Description**

Processes an EDM4eic file to extract a specific event and returns the event data in JSON format. Supports both local and remote files.

#### **Parameters**

- **Path Parameters**:
    - `event_number` (required): The number of the event to extract.
    - `filename` (optional): The path or URL of the EDM4eic file.

- **Query Parameters**:
    - `filename` (optional): The name or path of the file to process.
    - `f` (optional): An alternative parameter for the filename.

**Note**: You can provide the filename either as a query parameter or as part of the URL path.

#### **Usage**

1. **Process Local File via Query Parameter**

   ```bash
   curl "http://localhost:5454/api/v1/edm4eic/event/5?filename=path/to/file.edm4eic.root"
   ```

2. **Process Remote File via URL Path**

   ```bash
   curl "http://localhost:5454/api/v1/edm4eic/event/5/http://example.com/data/file.edm4eic.root"
   ```

### Asset Configuration

#### **Endpoint**

```
GET /assets/config.jsonc
```

#### **Description**

Serves the asset configuration file (`config.jsonc`) with additional server information injected dynamically.

#### **Usage**

```bash
curl "http://localhost:5454/assets/config.jsonc"
```

### Publishing

```bash
hatch build
hatch publish

# You will have to setup your pip authentication key
```