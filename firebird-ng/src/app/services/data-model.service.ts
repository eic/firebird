import {Injectable, linkedSignal, signal} from "@angular/core";
import { Event, DataExchange } from "@dexvis/firebird-core";
import { HttpClient } from "@angular/common/http";
import { UrlService } from "./url.service";
import { fetchTextFile, loadJSONFileEvents, loadZipFileEvents } from "../utils/data-fetching.utils";

/**
 * Service for loading and managing event/entry data in Firebird.
 *
 * This service fetches ROOT events converted by the server and Firebird DEX
 * data from JSON or ZIP, and stores the list of entries and the currently
 * selected entry as Angular signals.
 *
 * Fetching and parsing never change the stored entries: `adoptEvents()` does,
 * and EventDisplayService calls it only for the latest requested load, so a
 * slow earlier load cannot replace a newer one.
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
   * Converts ROOT events through the pyrobird convert endpoint and parses the
   * result. The server detects the data model (EDM4eic or EDM4hep) itself.
   * Does not change the loaded entries; see `adoptEvents()`.
   *
   * @param url - Location of the ROOT file: a `root://` URL, an http(s) URL,
   *   or a path the server serves.
   * @param entryNames - Entry numbers as typed: '0', '0-4', '1,3'. The server
   *   rejects the request when any of them is outside the file.
   * @param collections - Collection groups to convert (server `collections`
   *   query parameter, same names as `pyrobird convert --collections`).
   *   Empty means all.
   * @returns The parsed DEX document.
   * @throws Error with the reason: no backend, HTTP status and server message,
   *   not DEX, unsupported DEX version.
   */
  async fetchRootConversion(url: string, entryNames: string = "0", collections?: string[]): Promise<DataExchange> {
    const finalUrl = this.urlService.resolveConvertUrl(url, "auto", entryNames, collections);
    console.log(`[DataModelService.fetchRootConversion] Fetching: ${finalUrl}`);
    const text = await fetchTextFile(finalUrl);
    let dexData: unknown;
    try {
      dexData = JSON.parse(text);
    } catch (error) {
      throw new Error(`The server's conversion of '${url}' is not JSON: ${error instanceof Error ? error.message : error}`);
    }
    return this.parseDex(dexData, url);
  }

  /**
   * Fetches a Firebird DEX JSON or ZIP file and parses it. Does not change
   * the loaded entries; see `adoptEvents()`.
   *
   * @param url - The URL of the .firebird.json or .zip file; `asset://` and
   *   server-relative paths are resolved here.
   * @returns The parsed DEX document.
   * @throws Error with the reason: HTTP status, unreadable zip, not DEX,
   *   unsupported DEX version (with the upgrade command).
   */
  async fetchDex(url: string): Promise<DataExchange> {
    let finalUrl = url;
    if (url.startsWith("asset://")) {
      // 'asset://' becomes a relative 'assets/' path (no leading slash), so a
      // deployment under a subdirectory such as /firebird keeps working
      finalUrl = "assets/" + url.substring("asset://".length);
    } else if (!url.startsWith("http://") && !url.startsWith("https://")) {
      finalUrl = this.urlService.resolveDownloadUrl(url);
    }
    console.log(`[DataModelService.fetchDex] Loading: ${finalUrl}`);
    const dexData = finalUrl.endsWith("zip")
      ? await loadZipFileEvents(finalUrl)
      : await loadJSONFileEvents(finalUrl);
    return this.parseDex(dexData, url);
  }

  /**
   * Parses a DEX document that is already in memory.
   *
   * @param dexData - The parsed JSON object.
   * @param sourceName - File name or URL, for the error message.
   * @throws Error when the object is not a Firebird DEX document or has an
   *   unsupported version.
   */
  parseDex(dexData: unknown, sourceName = 'the document'): DataExchange {
    if (!this.isFirebirdDex(dexData)) {
      throw new Error(`'${sourceName}' is not a Firebird DEX document (it lacks "type": "firebird-dex-json")`);
    }
    return DataExchange.fromDexObj(dexData);
  }

  /** Publishes loaded events to the signals and selects the first one. */
  adoptEvents(data: DataExchange): void {
    this.entries.set(data.events);
    if (this.entries().length > 0) {
      // Explicitly the first entry, not setNextEntry(): `currentEntry` is a
      // linkedSignal that has already recomputed to entries[0], so "next"
      // would step to entries[1]. With a single event that wrapped back around
      // and looked right; loading several events showed the second one while
      // the painter drew the first.
      this.setCurrentEntry(this.entries()[0]);
    }
  }

  /**
   * Parses and adopts a DEX document that is already in memory.
   *
   * @param dexData - A parsed Firebird DEX document.
   * @returns The DataExchange, or null when the object is not DEX.
   */
  loadDexObject(dexData: unknown): DataExchange | null {
    if (!this.isFirebirdDex(dexData)) {
      console.error("[DataModelService.loadDexObject] The object does not conform to Firebird DEX JSON format.");
      return null;
    }
    const data = this.parseDex(dexData);
    this.adoptEvents(data);
    return data;
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

  setNextEntry() {
    const allEntries = this.entries();
    const current = this.currentEntry();

    // If no entries available, return
    if (allEntries.length === 0) {
      console.warn('[DataModelService.setNextEntry] No entries available');
      return;
    }

    // If no current entry, set the first one
    if (!current) {
      this.setCurrentEntry(allEntries[0]);
      return;
    }

    // Find the current entry index
    const currentIndex = allEntries.findIndex(entry => entry === current);

    // If current entry not found in the list (shouldn't happen), set first entry
    if (currentIndex === -1) {
      console.warn('[DataModelService.setNextEntry] Current entry not found in entries list');
      this.setCurrentEntry(allEntries[0]);
      return;
    }

    // Calculate the next index with wrapping
    const nextIndex = (currentIndex + 1) % allEntries.length;

    // Set the next entry
    this.setCurrentEntry(allEntries[nextIndex]);
    console.log(`[DataModelService.setNextEntry] Switching from entry ${currentIndex} to ${nextIndex} (${allEntries[nextIndex].id})`);
  }
}
