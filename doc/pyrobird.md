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
gunicorn --bind 0.0.0.0:5454 pyrobird.server:flask_app --log-level debug --capture-output
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
1. Start a local Firebird server on `http://localhost:5454`
2. Wait for the page to load
3. Capture a full-page screenshot
4. Save it to `screenshots/screenshot.png`
5. Automatically shut down the server

Screenshots are saved in a `screenshots/` directory with automatic numbering to prevent overwrites.

### Command Options

The screenshot command accepts several options to customize its behavior:

| Option                     | Type    | Default               | Description                                                                                                   |
|----------------------------|---------|-----------------------|---------------------------------------------------------------------------------------------------------------|
| `--url TEXT`               | String  | `http://localhost:5454` | URL to take the screenshot of. Use this if you want to screenshot a specific page or event.                    |
| `--output-path TEXT`       | String  | `screenshot.png`      | Base filename for the screenshot. Will be saved in `screenshots/` directory with auto-numbering if file exists. |
| `--work-path TEXT`         | String  | Current directory     | Set the base directory path for file downloads. Files in Firebird will be loaded relative to this path.        |
| `--unsecure-files`         | Flag    | `False`               | Allow unrestricted file downloads. Use with caution - see security notes in the serve section.                 |
| `--allow-cors`             | Flag    | `False`               | Enable CORS for downloaded files.                                                                              |
| `--disable-download`       | Flag    | `False`               | Disable all file downloads from the server.                                                                    |

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

First, ensure your data file is accessible, then use a URL that opens a specific event:

```bash
pyrobird screenshot --work-path=/path/to/data \
                    --url "http://localhost:5454/#/event?file=local://mydata.root&event=5" \
                    --output-path event_5.png
```

#### 4. Batch Processing Multiple Events

You can create a simple shell script to process multiple events:

```bash
#!/bin/bash
# batch_screenshots.sh

DATA_PATH="/path/to/data"
DATA_FILE="myevents.root"

for event in {0..9}; do
    pyrobird screenshot \
        --work-path="$DATA_PATH" \
        --url "http://localhost:5454/#/event?file=local://$DATA_FILE&event=$event" \
        --output-path "event_${event}.png"
    
    echo "Captured screenshot for event $event"
done
```

Make the script executable and run it:

```bash
chmod +x batch_screenshots.sh
./batch_screenshots.sh
```

#### 5. Screenshot with Different Server Configurations

If you need to allow access to files outside the working directory:

```bash
pyrobird screenshot --unsecure-files --output-path system_files.png
```

> **Warning**: Use `--unsecure-files` only on trusted personal machines. Never use in production or shared environments.

### Screenshot Configuration

The screenshot functionality uses the following default settings:

- **Viewport Size**: 1920x1080 pixels (Full HD)
- **Page Mode**: Full page screenshot (captures entire scrollable content)
- **Wait Strategy**: Waits for DOM content loaded (up to 10 seconds)
- **Additional Wait**: 2 seconds after page load to ensure rendering completes
- **Browser**: Headless Chromium

These settings are optimized for high-quality event display captures but are currently hardcoded in the implementation.

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

If the Flask server fails to start, check if port 5454 is already in use:

```bash
# On Linux/Mac
lsof -i :5454

# Kill the process if needed
kill -9 <PID>
```

#### Screenshots Are Black or Incomplete

If screenshots appear black or don't show the expected content:

1. The page might need more time to render. The command waits 2 seconds after page load, but complex visualizations might need longer.
2. Try taking a screenshot manually first to verify the URL works correctly.
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
capture_screenshot("http://localhost:5454/#/event?file=local://data.root&event=5", output_path)

print(f"Screenshot saved to {output_path}")
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
- **DOWNLOAD_PATH**: `str[getcwd()]`, Specifies the directory from which files can be downloaded when using relative paths.
- **PYROBIRD_DOWNLOAD_IS_DISABLED**: `bool[False]` If set to `True`, all download functionalities are disabled.
- **PYROBIRD_DOWNLOAD_IS_UNRESTRICTED**: `bool[False]`, allows unrestricted access to download any file, including sensitive ones.
- **CORS_IS_ALLOWED**: `bool[False]`, If set to `True`, enables Cross-Origin Resource Sharing (CORS) for download routes.




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
GET /api/v1/convert/edm4eic/<int:event_number>
GET /api/v1/convert/edm4eic/<int:event_number>/<path:filename>
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
