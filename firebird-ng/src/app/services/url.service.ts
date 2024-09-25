import { Injectable } from '@angular/core';
import {UserConfigService} from "./user-config.service";
import {ServerConfigService} from "./server-config.service";

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
  private userConfigHost = 'localhost';
  private userConfigPort = 5454;
  private userConfigUseApi = false;

  constructor(
    private userConfigService: UserConfigService,
    private serverConfigService: ServerConfigService
  ) {
    // Subscribe to user configuration changes to update local variables
    this.userConfigService.localServerHost.subject.subscribe((value) => { this.userConfigHost = value; });
    this.userConfigService.localServerPort.subject.subscribe((value) => { this.userConfigPort = value; });
    this.userConfigService.localServerUseApi.subject.subscribe((value) => { this.userConfigUseApi = value; });
  }

  /**
   * Resolves URLs that start with 'local://' by replacing the protocol with an appropriate base URL.
   *
   * - If the server is served by Pyrobird (`servedByPyrobird` is true), it uses the server's host and port.
   * - If the user has enabled API usage (`userConfigUseApi` is true), it uses the user's host and port.
   * - If neither condition is met, 'local://' is replaced with an empty string, resulting in a relative path.
   *
   * @param {string} url The URL to resolve.
   * @returns {string} The resolved URL.
   */
  public resolveLocalhostUrl(url: string): string {
    const firebirdConfig = this.serverConfigService.config;
    const localProto = 'local://';

    // Return the original URL if it doesn't start with 'local://'
    if (!url.startsWith(localProto)) {
      return url;
    }

    // Default replacement string (empty) for relative paths
    let replaceStr = '';

    if (firebirdConfig && firebirdConfig.servedByPyrobird) {
      // Use server host and port if served by Pyrobird
      replaceStr = `http://${firebirdConfig.serverHost}:${firebirdConfig.serverPort}/`;
    } else if (this.userConfigUseApi) {
      // Use user-configured host and port if API usage is enabled
      replaceStr = `http://${this.userConfigHost}:${this.userConfigPort}/`;
    }

    // Replace 'local://' with the determined base URL and append the rest of the path
    return replaceStr + url.substring(localProto.length);
  }
}
