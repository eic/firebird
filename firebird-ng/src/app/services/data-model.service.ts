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


  constructor(private userConfig: UserConfigService,
              private serverConfig: ServerConfigService,
              private urlService: UrlService,
              private http: HttpClient
              ) {
  }


  async loadEdm4EicData(entryNames: string = "0"): Promise<DataExchange|null> {
    try {

      let userInput = this.userConfig.edm4eicEventSource.value;
      // TODO url aliases if(this.serverConfig.config.)
      // resolveProtocolAlias()

      if(!userInput) {
        console.log("[DataModelService] No data source specified. I.e. !this.userConfig.edm4eicEventSource.value");
        return null;
      }

      // If we were able to get baseURL, we use it with endpoint
      // Otherwise we just open whatever...
      let url = this.urlService.resolveConvertUrl(userInput, "edm4eic", entryNames);


      // // if no protocol specified, assume local
      // if(!userInput.includes('://')) {
      //   userInput = "local://" + userInput;
      // }
      //
      // if(userInput.startsWith("local://")) {
      //   userInput = this.urlService.resolveLocalhostUrl(userInput);
      // }

      const jsonData = await fetchTextFile(url);
      //   //this.http.get(url, { responseType: 'text' })
      // );



      const dexData = JSON.parse(jsonData);
      let data = DataExchange.fromDexObj(dexData);

      console.log(data)
      return data;
    } catch (error) {
      console.error(`Failed to load data: ${error}`);
      console.log(`Default config will be used`);
    } finally {
    }
    return null;
  }


  async loadDexData(): Promise<DataExchange|null> {
    try {

      let userInput = this.userConfig.trajectoryEventSource.value;
      // TODO url aliases if(this.serverConfig.config.)
      // resolveProtocolAlias()

      if(!userInput) {
        console.log("[DataModelService] No data source specified. I.e. !this.userConfig.edm4eicEventSource.value");
        return null;
      }

      if(!userInput.endsWith("firebird.json") &&
         !userInput.endsWith("firebird.json.zip") &&
         !userInput.endsWith("firebird.zip"))
      {
        console.log("[DataModelService.loadDexData] Wrong extension. I.e. !this.userConfig.edm4eicEventSource.value");
      }

      let url = this.urlService.resolveDownloadUrl(userInput);

      let dexData = {};

      if(url.endsWith("zip")) {
        dexData = await loadZipFileEvents(url);
      } else {
        dexData = await loadJSONFileEvents(url);
      }

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
      console.error(`Failed to load data: ${error}`);
      console.log(`Default config will be used`);
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
