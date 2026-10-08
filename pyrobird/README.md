# pyrobird

[![PyPI - Version](https://img.shields.io/pypi/v/pyrobird.svg)](https://pypi.org/project/pyrobird)
[![PyPI - Python Version](https://img.shields.io/pypi/pyversions/pyrobird.svg)](https://pypi.org/project/pyrobird)

-----

## Installation

```bash
pip install pyrobird
```

Optional dependencies:

- `batch` - install playwright, that allows to make screenshots in batch mode
- `xrootd` - install libraries to read xrootd located files and URLs starting with `root://`
- `dev` - install pytest and other development requirements, mainly to run tests

If using `batch` for screenshots, after installing playwright, you need to install browser binaries:

```bash
python -m playwright install chromium
```

If installed via pip, `xrootd` library requires compilation, so the system should have cmake,
compiler and some xrootd dependencies installed.

For debian/ubuntu the packages to install to use xrootd: 

```bash
sudo apt install build-essential libxrootd-client-dev cmake zlib1g-dev uuid-dev libssl-dev python3-dev

```

Development installation 

It is recommended to use [uv](https://docs.astral.sh/uv/getting-started/installation/)

```bash
cd pyrobird                 # directory inside main firebird repo. NOT pyrobird/pyrobird - this is lib
uv venv                     # create virtual environment
source .venv/bin/activate   # activate it
uv sync                     # install all requirements
```

Still possible without uv

```bash
python -m pip install --editable .[dev,batch]

# with xrootd
python -m pip install --editable .[dev,batch,xrootd]
```

Running with Gunicorn (development mode)

```bash
gunicorn --bind 127.0.0.1:5454 pyrobird.server:flask_app --log-level debug --capture-output
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
python -m pip install --upgrade --editable  .[dev]
```

# Pyrobird Server

This server allows Firebird to work with local files and the local file system as
well as to complement frontend features such as opening XRootD files, etc.

Serve pyrobird locally and have access to files in current directory: 

```bash
pyrobird serve
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
| `--disable-files`          |       | Flag    | `False` | Disable all file access: local downloads and conversions, and conversions of remote `http://`, `https://` and `root://` files.                                                                                                                  |
| `--work-path TEXT`         |       | String  | `CWD`   | Set the base directory path for file downloads. Defaults to the current working directory. Use this option to specify where the server should look for files when handling download requests.                                                       |
| `--remote-hosts TEXT`      |       | String  | empty   | Comma-separated host names that remote conversions may read from. An entry that starts with a dot, such as `.jlab.org`, also matches its subdomains. Empty allows any host.                                                                     |
| `--host TEXT`              |       | String  | `127.0.0.1` | Address to listen on. Defaults to `127.0.0.1`, or `0.0.0.0` inside Docker and Kubernetes containers. Apptainer and Singularity keep `127.0.0.1`.                                                                                         |
| `--port INTEGER`           |       | Integer | `5454`  | Port to listen on.                                                                                                                                                                                                                            |


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

#### Bind address

By default the server listens on `127.0.0.1`, so only this machine can reach it.
Inside Docker and Kubernetes containers it listens on `0.0.0.0`, because the container
has its own network and loopback is not reachable from the host. Apptainer and
Singularity (for example, eic-shell) share the host network, so the server keeps
`127.0.0.1` there and the browser on the host reaches it directly.

Whenever the server listens on an address that other machines can reach, it prints a
warning with the work path. Pass `--host 127.0.0.1` to serve this machine only.


- Start server with default settings, Firebird works with files in current directory:
   ```bash
  pyrobird serve
   ```

- Set where Firebird will take files from:
   
   ```bash
   pyrobird serve --work-path=/home/username/datafiles
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

Set these keys in the Flask config, for example in a WSGI file through
`configure_flask_app({...})`. `pyrobird serve` also reads the ones that have a
command line option from environment variables of the same name.
Boolean keys accept `True`/`False` or the strings `"true"`, `"1"`, `"false"`, `"0"`.

- **PYROBIRD_DOWNLOAD_PATH**: `str[getcwd()]`, the work path. Relative file names resolve against it, and in restricted mode every local file must lie inside it once symlinks are resolved (`--work-path`).
- **PYROBIRD_DOWNLOAD_IS_DISABLED**: `bool[False]`, disables all file access: downloads, local conversions and remote conversions (`--disable-files`).
- **PYROBIRD_DOWNLOAD_IS_UNRESTRICTED**: `bool[False]`, allows unrestricted access to download any file, including sensitive ones (`--allow-any-file`).
- **PYROBIRD_CORS_IS_ALLOWED**: `bool[False]`, enables Cross-Origin Resource Sharing (CORS) for the API and config routes (`--allow-cors`). Read from the environment at import time as well.
- **PYROBIRD_REMOTE_HOSTS**: `str or list[empty]`, host names that remote conversions may read from (`--remote-hosts`). An entry that starts with a dot also matches subdomains. The check covers the requested URL; HTTP and XRootD redirects are followed.
- **PYROBIRD_CONVERT_MAX_ENTRIES**: `int[1000]`, the most entries one convert request may name.
- **PYROBIRD_API_BASE_URL**: `str[empty]`, the API base URL that the frontend uses (`--api-url`). Empty means the URL the browser used to reach the server.
- **PYROBIRD_FIREBIRD_CONFIG_PATH**: `str[empty]`, a `config.jsonc` to serve instead of the one bundled with the frontend (`--config`).
- **PYROBIRD_USER_CONFIGS**: `dict[empty]`, frontend config values (`{"key": value}`) merged over the `userConfigs` map of `config.jsonc`. A JSON object string also works.
- **PYROBIRD_STARTUP_COMMANDS**: `str or list[empty]`, commands the frontend runs once the display is ready (`--startup-commands`).




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

- **Access Control**: Keep `PYROBIRD_DOWNLOAD_IS_UNRESTRICTED` off unless one trusted user runs the server.
- **Path Traversal**: In restricted mode a file must resolve, symlinks included, to a path inside
  `PYROBIRD_DOWNLOAD_PATH`. The check compares whole path components, so `/data/work-secret` is not
  inside `/data/work`.

---

### Convert EDM4eic or EDM4hep Events

#### **Endpoint**

```
GET /api/v1/convert/<file_type>/<entries>
GET /api/v1/convert/<file_type>/<entries>/<path:filename>
```

#### **Description**

Converts entries of an EDM4eic or EDM4hep ROOT file to Firebird DEX and returns it as JSON.
Supports local files and remote `http://`, `https://` and `root://` files.

A local file passes the same access check as a download. A remote file needs file access
enabled (no `--disable-files`) and, when `PYROBIRD_REMOTE_HOSTS` is set, a host from that list.

Every requested entry must exist in the file. Otherwise the request fails with `400` and the
error lists the missing entries, the same rule the in-browser converter applies. A request may
name at most `PYROBIRD_CONVERT_MAX_ENTRIES` entries (default 1000).

#### **Parameters**

- **Path Parameters**:
    - `file_type` (required): `auto` (detect from branch types), `edm4eic` or `edm4hep`.
    - `entries` (required): Entries to convert: `3`, `1-5` or `1,2-5,8`.
    - `filename` (optional): The path or URL of the ROOT file.

- **Query Parameters**:
    - `filename` (optional): The name or path of the file to process.
    - `f` (optional): An alternative parameter for the filename.
    - `collections` (or `c`, optional): Comma-separated collection groups to
      convert, same values as `pyrobird convert --collections`
      (e.g. `tracker_hits,tracks,mc_particles`). Empty means all groups.

**Note**: You can provide the filename either as a query parameter or as part of the URL path.

#### **Usage**

1. **Process Local File via Query Parameter**

   ```bash
   curl "http://localhost:5454/api/v1/convert/edm4eic/5?filename=path/to/file.edm4eic.root"
   ```

2. **Process Remote File via URL Path**

   ```bash
   curl "http://localhost:5454/api/v1/convert/edm4eic/5/http://example.com/data/file.edm4eic.root"
   ```

### Asset Configuration

#### **Endpoint**

```
GET /assets/config.jsonc
```

#### **Description**

Serves the asset configuration file (`config.jsonc`) with additional server information injected dynamically:
`apiBaseUrl` (the URL the browser used, unless `PYROBIRD_API_BASE_URL` is set), `serverHost`, `serverPort`,
`servedByPyrobird`, and `userConfigs` merged with `PYROBIRD_USER_CONFIGS`.

A missing file under `/assets/` returns `404`. Other unknown paths return the frontend's
`index.html`, so the frontend's routes load directly.

#### **Usage**

```bash
curl "http://localhost:5454/assets/config.jsonc"
```

### Batch Screenshots

```bash
pyrobird screenshot --url "/display?dex=asset://data/example-cherenkov.firebird.json&event=2" --output-path check.png
```

The command serves the frontend itself on `127.0.0.1` and a free port (`--port` picks a fixed one),
opens the page in headless Chromium, waits until `window.firebird.ready` is true, saves the image in
`screenshots/` and stops the server. A path `--url`, or a localhost URL on port 5454 or without a port,
is pointed at that server with its path and query kept; other URLs, such as a development server on
`localhost:4200`, are captured as given. `--ready-timeout` sets the wait in seconds.

The exit code tells whether the capture shows a finished display:

| Code | Meaning |
|------|---------|
| `0`  | The display reported ready without errors. |
| `1`  | The server, the browser or the capture failed. |
| `2`  | The display never reported ready. The screenshot is still saved. |
| `3`  | The display reported errors in `window.firebird.errors`. The screenshot is still saved. |

### Publishing

Check the packages before an upload: the wheel must hold the frontend and the sample data,
and stay under PyPI's 100 MiB file limit.

```bash
pip install --upgrade build twine
python -m build                      # or: uv build
python scripts/check_dist.py dist/   # exits with 1 when a check fails
python -m twine upload dist/*

# You will have to setup your pip authentication key
```