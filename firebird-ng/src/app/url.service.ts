import { Injectable } from '@angular/core';
import {UserConfigService} from "./user-config.service";
import {ServerConfigService} from "./server-config.service";

let defaultProtocolAliases = [
  {"local://": "http://localhost/" },
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
 * let url = resolveProtocolAlias('local://8080/service', {
 *   "local://": "http://localhost/"
 * });
 * console.log(url); // Outputs: "http://localhost/8080/service"
 *
 * // Using a function for dynamic URL transformation:
 * url = resolveProtocolAlias('local://8080/service', {
 *   "local://": (url) => `http://localhost${url.substring(8)}`
 * });
 * console.log(url); // Outputs: "http://localhost8080/service"
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

  private userConfigHost = "localhost";
  private userConfigPort = 5454;
  private userConfigUseApi = false;



  constructor(private userConfigService: UserConfigService,
              private firebirdConfigService: ServerConfigService) {

    // Track user config changes
    this.userConfigService.localServerHost.subject.subscribe((value)=>{this.userConfigHost = value});
    this.userConfigService.localServerPort.subject.subscribe((value)=>{this.userConfigPort = value});
    this.userConfigService.localServerUseApi.subject.subscribe((value)=>{this.userConfigUseApi = value});
  }

  public resolveLocalhostUrl(url: string) {
    const firebirdConfig = this.firebirdConfigService.config;
    const localProto = "local://";

    if(!url.startsWith(localProto)) {
      return url;     // Not this function problem
    }

    // (!) important. By default we use "" so that if there is no localhost info, local:// could be replaced with ""
    // So that relative paths are used. We have to provide something
    let replaceStr = "";

    if(firebirdConfig.servedByPyrobird)  {
      replaceStr = `http://${firebirdConfig.serverHost}:${firebirdConfig.serverPort}/`;

    } else if(this.userConfigUseApi) {
      replaceStr = `http://${this.userConfigHost}:${this.userConfigPort}/`;
    }

    return replaceStr + url.substring(0, localProto.length);
  }
}
