# Running Firebird Locally

This tutorial explains how to run the Firebird backend (**Pyrobird**) on your local machine. This allows you to:
- Load geometry and event files from your local disk.
- Process large files without uploading them.
- Use Firebird with your own simulation data.

## 1. Install Pyrobird

Pyrobird is a Python package that serves as the backend for Firebird. You need Python 3.8 or newer.

Open your terminal and install it via pip:

```bash
python -m pip install --upgrade pyrobird
```

## 2. Download Example Data

Let's download some example files to test your local setup. We'll use the `epic_craterlake` geometry and a sample collision event.

Create a directory for your data and download the files:

```bash
# Create a directory
mkdir -p firebird_data
cd firebird_data

# Download Geometry (ROOT file)
wget https://github.com/eic/firebird/raw/main/firebird-ng/src/assets/data/epic_craterlake.root

# Download Events (Firebird ZIP format)
wget https://github.com/eic/firebird/raw/main/firebird-ng/src/assets/data/py8_dis-cc_18x275_minq2-1000_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip
```

## 3. Start the Server

Now, start the Pyrobird server. By default, it serves files from the current directory (and its subdirectories).
You can also manually specify a different directory using the `--work-path` option.

```bash
# Serve from the current directory (default)
# (assuming you are in the firebird_data directory)
pyrobird serve

# OR serve from a specific directory
pyrobird serve --work-path=/firebird_data
```

You should see output indicating the server is running, usually on port `5454`.

> **Note on Security:** By default, `pyrobird` only allows access to files in the directory specified by `--work-path`. This is a security feature to prevent accidental exposure of your system files.

## 4. Open Firebird and Load Local Files

1.  Open Firebird in your browser (e.g., [https://eic.github.io/firebird](https://eic.github.io/firebird) or your local development version).
2.  Click **Configure** in the top menu.
3.  Scroll down to **Server API Configuration**.
4.  Toggle **"Use specific backend"** to **ON**.
5.  Ensure the URL is set to `http://localhost:5454` (this is the default).
6.  In the **Geometry** section, enter:
    ```
    local://epic_craterlake.root
    ```
7.  In the **Event Source: JSON** section, enter:
    ```
    local://py8_dis-cc_18x275_minq2-1000_minp-150mev_vtxcut-5m_nevt-5.v0.4.firebird.zip
    ```
    *(Tip: You can use the full filename you downloaded)*

8.  Click **DISPLAY**.

You should now see the detector and events loaded from your local machine!

## 5. Supported File Formats

Firebird and Pyrobird work together to support various file formats:

### Geometry
- **ROOT Files (`.root`)**: Standard ROOT geometry files (TGeo). This is the primary format for detector geometry.

### Events
- **DEX (JSON)**: The native ["Display Event Exchange"](help/dex) format. It's a JSON-based format optimized for web display.
- **Zipped DEX (`.zip`)**: A compressed archive containing DEX JSON files. This is efficient for sharing multiple events and large datasets.
- **EDM4EIC (`.root`)**: The standard data model for the EIC. Pyrobird can automatically convert these files to DEX format on-the-fly when you request them.

> **Note:** When using `pyrobird serve`, you can point to any of these files using the `local://` prefix, and the server will handle the necessary conversions.

## Next Steps

Now that you have a local setup, you can explore more advanced topics:

- **[Merging Event Contents](/help/tutorials/03_merging_events)**: How to combine different data sources into a single view, e.g. true particles and reconstructed tracks.
- **[Visualizing Custom Objects](/help/tutorials/05_custom_objects)**: Adding your own markers and shapes to the display.
- **[Generating Trajectories](/help/dd4hep-plugin)**: Learn how to use the DD4Hep plugin to generate true particles trajectories from your simulations.
