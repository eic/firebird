/**
 * @file url.service.ts
 * @description Provides URL resolution services for handling file downloads and conversions in an Angular application.
 *              The service supports different configurations depending on how the application is served and includes
 *              protocol aliasing for custom URL schemes.
 */

import { Injectable } from '@angular/core';
import { ConfigService } from "./config.service";
import { ServerConfigService } from "./server-config.service";

/**
 * @class UrlService
 * @description This service resolves URLs for downloading and converting files. It handles different scenarios based
 *              on whether the application is served as a standalone static site, served by a backend like PyroBird, or
 *              configured to use a specific API endpoint. It also supports protocol aliases and special URL schemes.
 *
 * ### Assumptions:
 * - The application may be served in various configurations:
 *   - Standalone static site without backend API.
 *   - Served by a Flask application (e.g., PyroBird) with a backend API.
 *   - Served by another service with or without a backend API.
 * - The service needs to resolve URLs for files that may:
 *   - Be accessible over HTTP/HTTPS.
 *   - Be local files requiring backend API to serve them.
 *   - Use custom protocols (e.g., `asset://`, `epic://`).
 *
 * ### Use Cases:
 * - **Case 1: Downloading Files**
 *   - **1.1**: Input URL starts with protocol like `root://`, `http://` or `https://`. The URL is used as is.
 *   - **1.2**: Input URL has no protocol or is a local file. The service checks if a backend is available and constructs the download endpoint URL.
 * - **Case 2: Converting Files**
 *   - **2.1 & 2.2**: Input URL is converted using the backend 'convert' endpoint, regardless of the original protocol.
 *
 * ### Protocol Aliases:
 * - `asset://`: Points to assets served from the frontend server.
 * - `epic://`: Custom protocol replaced with a specific base URL.
 *
 * ### Examples:
 * - Download URL:
 *   - Input: `https://example.com/file.root`
 *   - Output: `https://example.com/file.root` (Case 1.1)
 * - Download URL:
 *   - Input: `/path/to/file.root`
 *   - Output: `<serverAddress>/api/v1/download?f=%2Fpath%2Fto%2Ffile.root` (if backend is available) (Case 1.2)
 * - Convert URL:
 *   - Input: `https://example.com/file.root`, `fileType`, `entries`
 *   - Output: `<serverAddress>/api/v1/convert/fileType/entries?f=https%3A%2F%2Fexample.com%2Ffile.root`
 */

@Injectable({
  providedIn: 'root'
})
export class UrlService {

  private serverAddress: string = '';
  private isBackendAvailable: boolean = false;

  // Protocol aliases mapping
  private readonly protocolAliases: { [key: string]: string } = {
    'epic://': 'https://eic.github.io/epic/artifacts/',
    // Add other protocol aliases here if needed
  };

  constructor(
    private userConfigService: ConfigService,
    private serverConfigService: ServerConfigService
  ) {
    this.initializeConfig();
  }

  /**
   * Initializes the service configuration and subscribes to changes in user and server configurations.
   */
  private initializeConfig() {
    this.updateServerConfig();

    // Subscribe to user configuration changes
    this.userConfigService.getConfig<string>('localServerUrl')?.subject.subscribe(() => {
      this.updateServerConfig();
    });
    this.userConfigService.getConfig<boolean>('localServerUseApi')?.subject.subscribe(() => {
      this.updateServerConfig();
    });
  }

  /**
   * Updates the backend availability and server address based on current configurations.
   */
  private updateServerConfig() {
    const servedByPyrobird = this.serverConfigService.config.servedByPyrobird;
    const userUseApi = this.userConfigService.getConfig<boolean>('localServerUseApi')?.value ?? false;
    const userServerUrl = this.userConfigService.getConfig<string>('localServerUrl')?.value ?? '';

    this.isBackendAvailable = servedByPyrobird || userUseApi;

    if (servedByPyrobird) {
      this.serverAddress = this.serverConfigService.config.apiBaseUrl;
    } else if (userUseApi) {
      this.serverAddress = userServerUrl;
    } else {
      this.serverAddress = '';
    }
  }

  /**
   * Resolves protocol aliases in the URL.
   *
   * - Replaces 'asset://' with the base URI of the application and the 'assets' path.
   * - Replaces any custom protocol aliases defined in the `protocolAliases` map.
   *
   * @param url The URL to resolve.
   * @returns The URL with protocol aliases resolved.
   */
  private resolveProtocolAliases(url: string): string {
    if (url.startsWith('asset://')) {
      const assetPath = url.substring('asset://'.length);
      // Assets are served from where the frontend is served.
      // Ensure there's no double slash
      const baseUri = document.baseURI.endsWith('/') ? document.baseURI : `${document.baseURI}/`;
      return `${baseUri}assets/${assetPath}`;
    }

    for (const alias in this.protocolAliases) {
      if (url.startsWith(alias)) {
        return url.replace(alias, this.protocolAliases[alias]);
      }
    }
    return url;
  }

  /**
   * Checks if a URL is absolute (i.e., starts with a protocol like 'http://').
   *
   * @param url The URL to check.
   * @returns True if the URL is absolute, false otherwise.
   */
  private isAbsoluteUrl(url: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/.test(url);
  }

  /**
   * Resolves the URL for downloading a file.
   *
   * **Case 1.1**: If the URL is absolute (starts with 'http://' or 'https://'), it is returned as is.
   *
   * **Case 1.2**: If the URL has no protocol, it uses the backend download endpoint if available.
   *               Constructs the URL: `<serverAddress>/api/v1/download?f=<encoded inputUrl>`
   *
   * @param inputUrl The input URL to resolve.
   * @returns The resolved URL for downloading.
   */
  public resolveDownloadUrl(inputUrl: string): string {
    inputUrl = this.resolveProtocolAliases(inputUrl);

    if (this.isAbsoluteUrl(inputUrl)) {
      // Case 1.1: Leave the URL as is
      return inputUrl;
    } else {
      // Case 1.2: Use the download endpoint if available
      if (this.isBackendAvailable && this.serverAddress) {
        return `${this.serverAddress}/api/v1/download?f=${encodeURIComponent(inputUrl)}`;
      } else {
        console.warn("Backend is not available to fetch the file");
        return inputUrl;
      }
    }
  }

  /**
   * Resolves the URL for converting a file using the 'convert' endpoint.
   *
   * **Case 2.1 & 2.2**: Constructs the URL using the backend 'convert' endpoint.
   *                     Constructs the URL: `<serverAddress>/api/v1/convert/<fileType>/<entries>?f=<encoded inputUrl>`
   *
   * @param inputUrl The input URL to resolve.
   * @param fileType The file type for conversion.
   * @param entries Additional entries for conversion.
   * @returns The resolved URL for conversion.
   */
  public resolveConvertUrl(inputUrl: string, fileType: string, entries: string): string {
    inputUrl = this.resolveProtocolAliases(inputUrl);

    if (this.isBackendAvailable && this.serverAddress) {
      return `${this.serverAddress}/api/v1/convert/${fileType}/${entries}?f=${encodeURIComponent(inputUrl)}`;
    } else {
      const message = "Backend is not available to convert the file";
      console.warn(message);
      throw Error(message);
    }
  }
}
