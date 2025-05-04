import {Injectable, linkedSignal, signal} from "@angular/core";
import { Event } from "../model/event";
import { HttpClient } from "@angular/common/http";
import { UrlService } from "./url.service";
import { DataExchange } from "../model/data-exchange";
import { fetchTextFile, loadJSONFileEvents, loadZipFileEvents } from "../utils/data-fetching.utils";

/**
 * Service for loading and managing event/entry data in Firebird.
 *
 * This service encapsulates loading EDM4eic data (converted to DEX),
 * as well as loading existing Firebird DEX data from JSON or ZIP.
 * It stores a list of entries and the currently selected entry
 * as Angular signals.
 */
@Injectable({
  providedIn: 'root'
})
export class DataModelService {

  /**
   * Signal holding the list of loaded entries (events).
   * Each Entry corresponds to one event's data in Firebird Dex format.
   */
  public entries = signal<Event[]>([]);

  /**
   * Signal holding the currently selected entry (event).
   */
  public currentEntry = linkedSignal(() => {
    if(this.entries().length > 0 ) {
      return this.entries()[0]
    }
    return null;
  });

  /**
   * Constructor that injects services needed for resolving URLs and making HTTP requests.
   * @param urlService - Service used for building/transforming URLs
   * @param http - Angular HttpClient for making network requests (currently not used directly here)
   */
  constructor(
    private urlService: UrlService,
    private http: HttpClient
  ) {}

  /**
   * Checks if an unknown object is valid "Firebird DEX" format by
   * verifying if it has a `"type": "firebird-dex-json"` property.
   *
   * @param obj - The object to inspect.
   * @returns True if the object has a `"type"` property equal to `"firebird-dex-json"`, otherwise false.
   */
  public isFirebirdDex(obj: unknown): boolean {
    return (
      typeof obj === "object" &&
      obj !== null &&
      "type" in obj &&
      (obj as any)["type"] === "firebird-dex-json"
    );
  }

  /**
   * Loads EDM4eic data from a given URL by calling the Firebird convert endpoint,
   * returning it in Firebird DEX format.
   *
   * @param url - The original location of the EDM4eic ROOT file (or other source).
   * @param entryNames - Comma-separated entry indices (default "0"). Passed to the converter service.
   * @returns A Promise that resolves to a DataExchange object or null if there's an error.
   */
  async loadEdm4EicData(url: string, entryNames: string = "0"): Promise<DataExchange | null> {
    try {
      // Early exit if no URL is provided
      if (!url) {
        console.log("[DataModelService.loadEdm4EicData] No data source specified.");
        return null;
      }

      // Let urlService build the final convert URL
      let finalUrl = this.urlService.resolveConvertUrl(url, "edm4eic", entryNames);
      console.log(`[DataModelService.loadDexData] Fetching: ${finalUrl}`);

      // Load the text from that URL
      const jsonData = await fetchTextFile(finalUrl);

      // Parse JSON
      const dexData = JSON.parse(jsonData);

      // Validate format
      if (!this.isFirebirdDex(dexData)) {
        console.error("[DataModelService.loadDexData] The JSON does not conform to Firebird DEX JSON format.");
        return null;
      }

      // Build DataExchange structure
      let data = DataExchange.fromDexObj(dexData);
      console.log(data);
      return data;

    } catch (error) {
      // Log errors
      console.error(`[DataModelService.loadEdm4EicData] Failed to load data: ${error}`);
      console.log("Default config will be used");
    } finally {
      // No final cleanup needed right now
    }
    return null;
  }

  /**
   * Loads a Firebird DEX JSON or ZIP file from a specified URL.
   *
   * @param url - The URL of the .firebird.json or .zip file.
   * @returns A Promise that resolves to a DataExchange object or null if there's an error.
   */
  async loadDexData(url: string): Promise<DataExchange | null> {
    try {
      // If no URL is provided, exit.
      if (!url) {
        console.log("[DataModelService.loadDexData] No data source specified.");
        return null;
      }

      // Basic extension check (not strictly required)
      if (
        !url.endsWith("firebird.json") &&
        !url.endsWith("firebird.json.zip") &&
        !url.endsWith("firebird.zip")
      ) {
        console.log("[DataModelService.loadDexData] Wrong extension or file type.");
      }

      // Resolve local aliases or relative paths
      let finalUrl = url;
      if (url.startsWith("asset://")) {
        finalUrl = "assets/" + url.substring("asset://".length);
      } else if (!url.startsWith("http://") && !url.startsWith("https://")) {
        finalUrl = this.urlService.resolveDownloadUrl(url);
      }

      let dexData = {};
      console.log(`[DataModelService.loadDexData] Loading: ${finalUrl}`);

      // Decide which loader to call based on file extension
      if (finalUrl.endsWith("zip")) {
        // Load from ZIP
        dexData = await loadZipFileEvents(finalUrl);
      } else {
        // Load from raw JSON
        dexData = await loadJSONFileEvents(finalUrl);
      }

      // Validate Firebird DEX structure
      if (!this.isFirebirdDex(dexData)) {
        console.error("[DataModelService.loadDexData] The JSON does not conform to Firebird DEX JSON format.");
        return null;
      }

      console.log(`[DataModelService.loadDexData] Deserializing from DEX`);
      let data = DataExchange.fromDexObj(dexData);
      console.log(data);

      // Extract entry names/IDs for debugging or usage
      const entryNames = data.events.map((entry) => entry.id);

      // Update service signals with the newly loaded entries
      if (dexData) {
        this.entries.set(data.events);
        if (this.entries().length > 0) {
          // If at least one entry is present, automatically set the first as current
          this.setCurrentEntry(this.entries()[0]);
        }
      }

      return data;

    } catch (error) {
      console.error(`[DataModelService.loadDexData] Failed to load data: ${error}`);
      console.log(`[DataModelService.loadDexData] Default config will be used`);
    } finally {
      // No final cleanup needed right now
    }
    return null;
  }

  /**
   * Sets the currently selected entry (event) to the provided `Entry`.
   *
   * @param entry - The Entry object to be marked as current.
   */
  setCurrentEntry(entry: Event): void {
    console.log(`[DataModelService.setCurrentEntry] Setting event: ${entry.id}`);
    this.currentEntry.set(entry);
  }

  /**
   * Finds and sets the current entry by its name (i.e. `entry.id`).
   *
   * @param name - The string name or ID of the entry to set as current.
   */
  setCurrentEntryByName(name: string): void {
    // Look up the first Entry whose 'id' matches the provided name
    const found = this.entries().find((entry) => entry.id === name);

    // If found, update currentEntry; otherwise log a warning.
    if (found) {
      this.setCurrentEntry(found);
    } else {
      console.warn(`[DataModelService] setCurrentEntryByName: Entry with id='${name}' not found.`);
    }
  }
}
