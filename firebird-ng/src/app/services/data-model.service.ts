import {Injectable} from "@angular/core";
import {UserConfigService} from "./user-config.service";
import {Object3D} from "three";
import {defaultFirebirdConfig, ServerConfigService} from "./server-config.service";
import {Entry} from "../model/entry";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";
import {resolveProtocolAlias, UrlService} from "./url.service";
import {DataExchange} from "../model/data-exchange";
import {loadJSONFileEvents, loadZipFileEvents} from "../utils/data-fetching.utils";

@Injectable({
  providedIn: 'root'
})
export class DataModelService {

  public currentEvent: Entry|null = null;


  constructor(private userConfig: UserConfigService,
              private serverConfig: ServerConfigService,
              private urlService: UrlService,
              private http: HttpClient
              ) {


  }

  public getEndpointDownload(fileName:string): string {
    return `/api/v1/download?f=${fileName}`
  }

  public getEndpointEdm4eic(fileName:string, entries:string): string {
    return `/api/v1/convert/edm4eic/${entries}?f=${fileName}`;
  }

  public getApiServerBase(): string {
    const config = this.serverConfig?.config;
    if (config && config.servedByPyrobird) {
      // Use server host and port if served by Pyrobird
      return `http://${config.serverHost}:${config.serverPort}`;
    } else if (this.userConfig.localServerUseApi.value) {
      // Use user-configured host and port if API usage is enabled
      return `http://${this.userConfig.localServerHost.value}:${this.userConfig.localServerPort.value}`;
    }
    return "";
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

      const baseUrl = this.getApiServerBase();
      const endPoint = this.getEndpointEdm4eic(userInput, entryNames);

      // If we were able to get baseURL, we use it with endpoint
      // Otherwise we just open whatever...
      let url = baseUrl ? `${baseUrl}/${endPoint}` : userInput;


      // // if no protocol specified, assume local
      // if(!userInput.includes('://')) {
      //   userInput = "local://" + userInput;
      // }
      //
      // if(userInput.startsWith("local://")) {
      //   userInput = this.urlService.resolveLocalhostUrl(userInput);
      // }

      const jsonData = await firstValueFrom(
        this.http.get(url, { responseType: 'text' })
      );

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

      let url = "";

      if(userInput.startsWith("asset://")) {
        url = userInput.replace("asset://", "")
      } else {
        const baseUrl = this.getApiServerBase();
        const endPoint = this.getEndpointDownload(userInput);

        // If we were able to get baseURL, we use it with endpoint
        // Otherwise we just open whatever...
        url = baseUrl ? `${baseUrl}/${endPoint}` : userInput;
      }

      let dexData = {};

      if(url.endsWith("zip")) {
        dexData = await loadZipFileEvents(url);
      } else {
        dexData = await loadJSONFileEvents(url);
      }

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
}
