import { Injectable } from '@angular/core';
import {UserConfigService} from "./user-config.service";
import {ServerConfig, ServerConfigService} from "./server-config.service";

let defaultProtocolAliases = [
  {"epic://": "https://eic.github.io/epic/artifacts/" }
]

/**
 * Resolves and replaces protocol aliases in a URL with their actual URL counterparts.
 * This function supports both direct string replacements and dynamic transformations via functions.
 *
 * @param {string} url The URL to be transformed.
 * @param {Object} aliases An object mapping protocol aliases to either strings or functions.
 * The keys represent the protocol alias (e.g., "local://") and the values can be either:
 *   - A string representing the full replacement URL.
 *   - A function that takes the original URL as an argument and returns the transformed URL.
 * If no aliases are provided, the function will use an empty object by default.
 *
 * @returns {string} The URL transformed based on the provided aliases. If no matching alias is found,
 * the original URL is returned unchanged.
 *
 * @example
 * // Using string replacement:
 * let url = resolveProtocolAlias('local://service', {
 *   "local://": "http://localhost:8080/"
 * });
 *
 * Outputs: "http://localhost:8080/service"
 *
 * // Using a function for dynamic URL transformation:
 * url = resolveProtocolAlias('local://service', {
 *   "local://": (url) => `http://localhost:8080/${url.substring(8)}`
 * });
 * console.log(url); // Outputs: "http://localhost:8080/service"
 */
export function resolveProtocolAlias(url: string, aliases: { [key: string]: string | ((url: string) => string) } = {}): string {
  // Iterate through alias keys to find and replace the protocol if matched
  Object.keys(aliases).forEach(alias => {
    if (url.startsWith(alias)) {
      const value = aliases[alias];
      // Check if the alias value is a function, then call it with the URL, else replace directly
      url = typeof value === 'function' ? value(url) : url.replace(alias, value);
    }
  });

  // Return the modified URL
  return url;
}


@Injectable({
  providedIn: 'root'
})
export class UrlService {



  // Default user configuration values
  private userConfigHost = 'http://localhost:5454';
  private userConfigUseApi = false;
  private serverConfig: ServerConfig;

  constructor(
    private userConfigService: UserConfigService,
    private serverConfigService: ServerConfigService
  ) {
    // Subscribe to user configuration changes to update local variables
    this.userConfigService.localServerUrl.subject.subscribe((value) => { this.userConfigHost = value; });
    this.userConfigService.localServerUseApi.subject.subscribe((value) => { this.userConfigUseApi = value; });
    this.serverConfig = this.serverConfigService.config;
  }

  public getEndpointDownload(fileName:string): string {
    return `/api/v1/download?f=${fileName}`
  }

  public getEndpointConvert(fileName:string, entries:string, fileType="edm4eic"): string {
    return `/api/v1/convert/${fileType}/${entries}?f=${fileName}`;
  }

  public getApiServerBase(): string {

    if (this.serverConfig.servedByPyrobird) {
      // Use server host and port if served by Pyrobird
      const protocol = window.location.protocol;  // e.g., 'http:' or 'https:'
      return `${protocol}//${this.serverConfig.serverHost}:${this.serverConfig.serverPort}`;
    } else if (this.userConfigUseApi) {
      // Use user-configured host and port if API usage is enabled
      return this.userConfigHost;
    }

    // If we are here, then it is a static site without API
    return document.baseURI;
  }

  public get isBackendAvailable() {
    return this.serverConfig.servedByPyrobird || this.userConfigUseApi;
  }


  /**
   * Resolves URLs that start with 'local://' by replacing the protocol with an appropriate base URL.
   *
   * - If the server is served by Pyrobird (`servedByPyrobird` is true), it uses pyrobird download API endpoint
   * - If the user has enabled API usage (`userConfigUseApi` is true), it uses the user's host with download API endpoint
   * - If neither condition is met, 'local://' is replaced with an empty string, resulting in a relative path.
   *
   * @param {string} url The URL to resolve.
   * @returns {string} The resolved URL.
   */
  public resolveLocalhostUrl(url: string): string {
    const serverConfig = this.serverConfigService.config;
    const localProto = 'local://';


    // Return the original URL if it doesn't start with 'local://'
    if (!url.startsWith(localProto)) {
      return url;
    }

    // Remove local://
    const fileName = url.substring(localProto.length);

    // Default replacement string (empty) for relative paths
    let base = this.getApiServerBase();

    // Do we need go to download API?
    if(this.isBackendAvailable) {
      return this.getApiServerBase() + this.getEndpointDownload(fileName)
    }

    // Replace 'local://' with the determined base URL and append the rest of the path
    return `${this.getApiServerBase()}/${fileName}`;
  }

  /**
   * Transforms inputUrl if needed and return a correct thing that can be fetched
   * @param inputUrl
   */
  public resolveUrl(inputUrl: string): string {
    let result = inputUrl;

    // What if there is no protocol?
    if(!inputUrl.includes("://")) {

      // Assume it is a local file
      inputUrl = "local://" + inputUrl;
    }

    // One special case if url starts with asset://
    if(inputUrl.startsWith("asset://")) {
      inputUrl = inputUrl.replace("asset://", "");
      // Assets are always served from where frontend is served.
      // We have 1 level or routing so far. If Angular SPA will have multilevel routing this will fail
      result = `${document.baseURI}/assets/${inputUrl}`;
    } else if (inputUrl.startsWith("local://")){
      result = this.resolveLocalhostUrl(inputUrl);
    }

    return result;
  }
}
