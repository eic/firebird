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
- `test` - install pytest, mainly to run tests in development build

> If using `batch` for screenshots, after installing playwright, you need to install browser binaries:
> ```bash
> python -m playwright install chromium
> ```

> If installed via pip, `xrootd` library requires compilation, so the system should have cmake,
> compiler and some xrootd dependencies installed.

Development installation

```bash
python -m pip install --editable .[test,batch]
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
python -m pip install --upgrade --editable  .[test]
```

# Pyrobird Server

This server allows Firebird to work with local files and the local file system as
well as to complement frontend features such as opening XRootD files, etc.

Serve Firobird locally and have access to files in current directory:

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
| `--startup-commands TEXT`  |       | String  | none    | Commands the frontend runs once the display is ready, `type:arg` items separated by `;`. Example: `open-dex:file.firebird.zip;show-event:2`. See the [Command Bus](/command-bus) page.                                                          |


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
warning with the work path. Pass `--host 127.0.0.1` to serve this machine only, or
`--host 0.0.0.0` to accept connections from other machines.

The server has no shutdown endpoint: stop it with Ctrl+C or by ending the process.


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


## File conversion and DEX utilities

```bash
pyrobird convert input.edm4hep.root                  # EDM4hep/EDM4eic ROOT -> DEX v1 JSON
pyrobird convert input.root -o out.firebird.json -e 0-4
pyrobird convert input.root -c tracker_hits,mc_particles   # select collection groups
pyrobird merge file1.firebird.json file2.firebird.json -o merged.firebird.json
pyrobird smooth input.firebird.json -o smoothed.firebird.json
pyrobird smooth events.firebird.zip -o events_s.firebird.zip   # .zip in/out works too
pyrobird upgrade old.firebird.json new.firebird.json # one-shot DEX 0.04 -> 1.0
pyrobird upgrade events.firebird.zip
```

`pyrobird convert` collection groups (`-c`/`--collections`, empty = all):

- `tracker_hits` — hit collections as box hits (both models)
- `tracks` — `CentralTrackSegments` reconstructed trajectories (edm4eic)
- `mc_trajectories` — MC-truth trajectories connecting sim hits (edm4hep)
- `mc_particles` — a straight vertex→endpoint line for **every** `MCParticles`
  entry (both models), subdivided on a fixed time grid (`--mc-step-time`,
  default 0.2 ns; `--mc-max-points` caps points per line) so the time
  animation reveals each line at the particle's real speed. Trajectory id
  equals the MCParticle index. The Firebird display converts this group by
  default but starts it hidden — the eye on the `MCParticles` row of the
  Physics tree shows it.

`pyrobird upgrade` converts files written by older Firebird tools (DEX 0.04)
to the current format (see [Data Format](/dex)); the current frontend loads
version 1.0 only. Unknown custom group types fail the conversion with a list
of what was found; add `--skip-unknown` to drop them and continue.

## Batch Screenshots

The `pyrobird screenshot` command allows you to capture screenshots of Firebird visualizations in batch mode. This is particularly useful for:

- Generating visualizations for publications and presentations
- Creating automated documentation of event displays
- Batch processing multiple events for comparison
- Quality assurance and validation workflows

### Installation

To use the screenshot functionality, you need to install pyrobird with the `batch` optional dependency:

```bash
pip install pyrobird[batch]
```

After installing, you need to install the Chromium browser binaries used by Playwright:

```bash
python -m playwright install chromium
```

> **Note**: On the first run, Playwright will download Chromium (~100MB) if it's not already installed on your system.

### Basic Usage

The simplest way to capture a screenshot:

```bash
pyrobird screenshot
```

This command will:
1. Start its own Firebird server on `127.0.0.1` and a free port (`--port` sets a
   fixed one); a server that already runs on port 5454 is neither used nor stopped
2. Open `--url` in headless Chromium: a path such as `/display?dex=...`, or a
   localhost URL on port 5454 or without a port, is pointed at that server with
   its path and query kept; any other URL, such as `ng serve` on
   `localhost:4200`, is captured as given
3. Wait until the display reports ready (geometry loaded, event data loaded,
   startup commands executed) or reports an error; the frontend publishes both
   on `window.firebird`, see [Command Bus](/command-bus)
4. Capture a full-page screenshot and save it to `screenshots/screenshot.png`
5. Stop the server and exit with a code that says whether the capture shows a
   finished display

Screenshots are saved in a `screenshots/` directory with automatic numbering to prevent overwrites.

| Exit code | Meaning |
|-----------|---------|
| `0` | The display reported ready without errors. |
| `1` | The server, the browser or the capture failed (for example, `--port` is in use, or the frontend is not built into pyrobird). |
| `2` | The display never reported ready within `--ready-timeout`. The screenshot is still saved. |
| `3` | The display reported errors in `window.firebird.errors`, for example a missing data file. The screenshot is still saved and the errors are printed. |

Check the exit code in scripts: a capture with code 2 may show a partly
loaded display.

### Command Options

The screenshot command accepts several options to customize its behavior:

| Option                     | Type     | Default                 | Description                                                                                                   |
|----------------------------|----------|-------------------------|---------------------------------------------------------------------------------------------------------------|
| `--url TEXT`               | String   | `/`                     | Page to capture: a path such as `/display?dex=...` (served by the command's own server) or a full URL. Deep links work here, see [Deep Links](/deep-links). |
| `--port INT`               | Integer  | `0`                     | Port of the command's own server; `0` picks a free port. The command fails with exit code 1 if the port is in use. |
| `--commands TEXT`          | String   | none                    | Commands the display runs before the capture, `type:arg` items separated by `;`. Example: `open-dex:file.firebird.zip;show-event:2;camera-preset:farforward`. |
| `--ready-timeout INT`      | Integer  | `120`                   | Seconds to wait for the display to report ready (geometry loaded, commands done). On timeout a warning is printed, the capture falls back to a short fixed wait, and the command exits with code 2. |
| `--output-path TEXT`       | String   | `screenshot.png`        | Base filename for the screenshot. Will be saved in `screenshots/` directory with auto-numbering if file exists. |
| `--work-path TEXT`         | String   | Current directory       | Set the base directory path for file downloads. Files in Firebird will be loaded relative to this path.        |
| `--unsecure-files`         | Boolean  | `False`                 | Allow unrestricted file downloads. Use with caution - see security notes in the serve section.                 |
| `--allow-cors`             | Boolean  | `False`                 | Enable CORS for downloaded files.                                                                              |
| `--disable-download`       | Boolean  | `False`                 | Disable all file downloads from the server.                                                                    |

### Examples

#### 1. Basic Screenshot with Custom Output Name

```bash
pyrobird screenshot --output-path event_001.png
```

This saves the screenshot as `screenshots/event_001.png` (or `screenshots/event_001_001.png` if the file already exists).

#### 2. Screenshot with Custom Data Directory

```bash
pyrobird screenshot --work-path=/path/to/data --output-path detector_view.png
```

This allows Firebird to access files in `/path/to/data` when loading event data.

#### 3. Screenshot a Specific Event

Use a deep link (see [Deep Links](/deep-links)) that opens the data file and
selects the event. Relative file paths resolve under `--work-path`:

```bash
pyrobird screenshot --work-path=/path/to/data \
                    --url "/display?dex=mydata.firebird.zip&event=5" \
                    --output-path event_5.png
```

#### 4. Commands Instead of URLs

The `--commands` option feeds the same actions through the server
configuration, which keeps the URL clean and adds actions that have no URL
shorthand, such as camera presets:

```bash
pyrobird screenshot --work-path=/path/to/data \
                    --commands "open-dex:mydata.firebird.zip;show-event:5;camera-preset:farforward" \
                    --output-path event_5_farforward.png
```

#### 5. Batch Processing Multiple Events

You can create a simple shell script to process multiple events:

```bash
#!/bin/bash
# batch_screenshots.sh

DATA_PATH="/path/to/data"
DATA_FILE="myevents.firebird.zip"

for event in {0..9}; do
    if pyrobird screenshot \
        --work-path="$DATA_PATH" \
        --url "/display?dex=$DATA_FILE&event=$event" \
        --output-path "event_${event}.png"; then
        echo "Captured screenshot for event $event"
    else
        echo "Event $event: pyrobird screenshot exited with $?" >&2
    fi
done
```

Make the script executable and run it:

```bash
chmod +x batch_screenshots.sh
./batch_screenshots.sh
```

#### 6. Screenshot with Different Server Configurations

If you need to allow access to files outside the working directory:

```bash
pyrobird screenshot --unsecure-files --output-path system_files.png
```

> **Warning**: Use `--unsecure-files` only on trusted personal machines. Never use in production or shared environments.

### Screenshot Configuration

The screenshot functionality uses the following default settings:

- **Viewport Size**: 1920x1080 pixels (Full HD)
- **Page Mode**: Full page screenshot (captures entire scrollable content)
- **Wait Strategy**: after the page loads, the capture waits until the display
  reports `window.firebird.ready === true` (geometry loaded, event data
  loaded, startup commands executed) or a non-empty `window.firebird.errors`.
  Control the limit with `--ready-timeout` (default 120 s). If neither appears
  (an old frontend build, or a URL that is not the display page), a warning is
  printed, the capture falls back to a short fixed wait, and the command exits
  with code 2: the capture may show a partially loaded display.
- **Browser**: Headless Chromium

### Output Directory Structure

Screenshots are automatically organized in a `screenshots/` directory with smart numbering:

```
screenshots/
├── screenshot.png          # First screenshot
├── event_001.png           # First screenshot with custom name
├── event_001_001.png       # Second screenshot with same name (auto-numbered)
├── event_001_002.png       # Third screenshot with same name
└── detector_view.png       # Another screenshot
```

The auto-numbering system:
- If `filename.png` doesn't exist, it's created as-is
- If it exists, the next available number is found (e.g., `filename_001.png`)
- Numbering continues sequentially even if there are gaps

### Troubleshooting

#### Playwright Not Installed

If you see an error about Playwright not being installed:

```bash
pip install playwright
python -m playwright install chromium
```

#### Server Won't Start

The command picks a free port by default. With `--port`, it exits with code 1
when that port is in use; find the process that holds it:

```bash
# On Linux/Mac
lsof -i :<port>
```

If the command reports that the server does not serve the frontend, the
frontend build is missing from the pyrobird package (a source checkout needs
`python build.py build_ng` and `python build.py cp_ng`).

#### Screenshots Are Black or Incomplete

If screenshots appear black or don't show the expected content:

1. Check the exit code and the ready/warning line. Exit code 0 and "Display
   reported ready" mean geometry and events finished loading before the
   capture; exit code 2 means the capture fell back to a fixed wait and the
   display was probably still loading: raise `--ready-timeout`, or check why
   loading never finishes. Exit code 3 prints the display's error messages.
2. Try opening the same URL manually in a browser first to verify it works.
3. Check that your data files are accessible from the `--work-path` directory.

#### Permission Errors

If you get permission errors when accessing files:

1. Make sure the `--work-path` includes all necessary data files
2. Check file permissions on your data files
3. Consider using `--unsecure-files` for testing (on personal machines only)

### Advanced: Programmatic Usage

You can also use the screenshot functionality programmatically in Python:

```python
from pyrobird.cli.screenshot import capture_screenshot, get_screenshot_path

# Generate unique output path
output_path = get_screenshot_path("my_event.png")

# Capture screenshot (requires server to be running)
state = capture_screenshot("http://localhost:5454/display?dex=data.firebird.zip&event=5", output_path)

print(f"Screenshot saved to {output_path}; ready={state.ready}, errors={state.errors}")
```

> **Note**: When using programmatically, you need to manage the Flask server lifecycle yourself.

### Tips for Best Results

1. **Consistent Naming**: Use descriptive names that include event numbers or identifiers
2. **Batch Processing**: Write scripts to automate screenshot capture for multiple events
3. **Resolution**: The default 1920x1080 viewport provides good quality for most purposes
4. **Data Organization**: Keep your data files organized and use `--work-path` to point to the correct directory
5. **Preview First**: Manually check one or two events in the browser before running batch operations


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