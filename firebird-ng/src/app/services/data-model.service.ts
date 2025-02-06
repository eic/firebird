import {Injectable, signal} from "@angular/core";
import {UserConfigService} from "./user-config.service";
import {Object3D} from "three";
import {defaultFirebirdConfig, ServerConfigService} from "./server-config.service";
import {Entry} from "../model/entry";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";
import {UrlService} from "./url.service";
import {DataExchange} from "../model/data-exchange";
import {fetchTextFile, loadJSONFileEvents, loadZipFileEvents} from "../utils/data-fetching.utils";

@Injectable({
  providedIn: 'root'
})
export class DataModelService {

  // Signal to store the list of entries
  public entries = signal<Entry[]>([]);

  // Signal to store the currently selected entry
  public currentEntry = signal<Entry | null>(null);


  constructor(private urlService: UrlService,
              private http: HttpClient
              ) {
  }


  async loadEdm4EicData(url:string, entryNames: string = "0"): Promise<DataExchange|null> {
    try {
      // TODO url aliases if(this.serverConfig.config.)
      // resolveProtocolAlias()

      if(!url) {
        console.log("[DataModelService.loadEdm4EicData] No data source specified. I.e. !this.userConfig.edm4eicEventSource.value");
        return null;
      }

      // If we were able to get baseURL, we use it with endpoint
      // Otherwise we just open whatever...
      let finalUrl = this.urlService.resolveConvertUrl(url, "edm4eic", entryNames);

      console.log(`[DataModelService.loadDexData] Fetching: ${finalUrl}`);
      const jsonData = await fetchTextFile(finalUrl);

      const dexData = JSON.parse(jsonData);
      let data = DataExchange.fromDexObj(dexData);

      console.log(data)
      return data;
    } catch (error) {
      console.error(`[DataModelService.loadEdm4EicData] Failed to load data: ${error}`);
      console.log(`Default config will be used`);
    } finally {
    }
    return null;
  }


  async loadDexData(url: string): Promise<DataExchange|null> {
    try {

      //let userInput = this.userConfig.dexJsonEventSource.value;



      if(!url) {
        console.log("[DataModelService.loadDexData] No data source specified. I.e. !this.userConfig.edm4eicEventSource.value");
        return null;
      }

      if(!url.endsWith("firebird.json") &&
         !url.endsWith("firebird.json.zip") &&
         !url.endsWith("firebird.zip"))
      {
        console.log("[DataModelService.loadDexData] Wrong extension. I.e. !this.userConfig.edm4eicEventSource.value");
      }

      // TODO better way to resolve url aliases if(this.serverConfig.config.)
      let finalUrl = url;
      if(url.startsWith("asset://")) {
        finalUrl = "/assets/" + url.substring("asset://".length);
      }
      else if(!url.startsWith("http://") && !url.startsWith("https://")) {
        finalUrl = this.urlService.resolveDownloadUrl(url);
      }

      let dexData = {};

      console.log(`[DataModelService.loadDexData] Loading: ${finalUrl}`);
      if(finalUrl.endsWith("zip")) {
        dexData = await loadZipFileEvents(finalUrl);
      } else {
        dexData = await loadJSONFileEvents(finalUrl);
      }

      console.log(`[DataModelService.loadDexData] Deserializing from DEX`);
      let data = DataExchange.fromDexObj(dexData);
      console.log(data)

      const entryNames = data.entries.map(entry => entry.id); // Adjust based on your DataExchange structure
      if (dexData) {
        this.entries.set(data.entries); // Update the signal with the loaded entries
        if(this.entries().length > 0) {
          this.setCurrentEntry(this.entries()[0]);
        }
      }

      return data;
    } catch (error) {
      console.error(`[DataModelService.loadDexData] Failed to load data: ${error}`);
      console.log(`[DataModelService.loadDexData] Default config will be used`);
    } finally {
    }
    return null;
  }

  // Method to set the current entry
  setCurrentEntry(entry: Entry): void {
    this.currentEntry.set(entry);
  }

  setCurrentEntryByName(name: string): void {

  }


}
