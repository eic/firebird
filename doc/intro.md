# EIC Event Display

# Introduction to Firebird

## Overview

Firebird is a modern, web-based event display framework (built on [Phoenix event display](http://phoenix-dev.surge.sh) library) designed specifically for the Electron-Ion Collider (EIC) experiments. Built to serve both scientific and outreach purposes, Firebird provides a versatile platform for visualizing detector geometries, particle interactions, and physics processes in an intuitive and accessible manner.

As a core visualization tool for the EIC project, Firebird supports the needs of detector experts, physicists, and science communicators by offering a modular, extensible architecture that can adapt to evolving research requirements while maintaining ease of use.

## Key Features

- **Web-based Architecture**: Access Firebird from any device with a web browser, whether deployed centrally or run locally for development
- **Time-aware Visualization**: Full support for streaming readout data with 4D visualization capabilities
- **Modular Design**: Extensible through plugins for customized data loaders, visualization styles, and analysis tools
- **Interactive Analysis**: Examine detector components, track particles, and inspect physics data with intuitive controls
- **Multi-experiment Support**: Designed for ePIC while maintaining compatibility with future IP8 detector and other experiments
- **Comprehensive Data Handling**: Compatible with simulation outputs, reconstruction data, and raw detector signals
- **Collaboration Tools**: Share visualizations and findings with colleagues through exportable views and states

## Use Cases

### Scientific Research and Analysis

Firebird serves as a powerful tool for researchers working on detector optimization, particle reconstruction algorithms, and physics analysis. Its ability to visualize complex data structures helps in understanding detector responses and particle interactions at a detailed level.

### Debugging and Quality Control

For detector experts and software developers, Firebird offers specialized tools for debugging simulations, verifying reconstruction algorithms, and monitoring data quality. The framework integrates with continuous integration pipelines and supports automated testing workflows.

### Education and Outreach

Firebird transforms complex scientific concepts into engaging visualizations suitable for presentations, publications, and public engagement. Its intuitive interface makes it accessible to audiences with varying levels of scientific knowledge.


## Development server

Run `ng serve` in `firebird-ng` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

# Firebird Data Exchange format

Data exchange is both JSON and Javascript object compatible.

It starts with `"type":"firebird-dex-json"` and the version, any custom origin info and a list of entries.
In HENP physics `entry` may correspond to `event` data.

```json5
{
  "type":"firebird-dex-json",
  "version": "0.01",
  "origin": {any custom origin info here"},"entries": [
    entry1, entry2, ...
  ]
}
```

- **version** - is JSON schema version
- **origin** - designed for any general custom info such as original file name,
  timestamp, simulation software version, etc.
- **entries** - list of entries/events. The format is below.
