import {Injectable} from "@angular/core";
import {UserConfigService} from "./user-config.service";
import {Object3D} from "three";
import {defaultFirebirdConfig, ServerConfigService} from "./server-config.service";
import {Entry} from "../model/entry";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";
import {resolveProtocolAlias, UrlService} from "./url.service";
import {DataExchange} from "../model/data-exchange";

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

  async loadData(): Promise<DataExchange|null> {
    try {

      let userInput = this.userConfig.edm4eicEventSource.value;
      // TODO url aliases if(this.serverConfig.config.)
      // resolveProtocolAlias()

      if(!userInput) {
        console.log("No data source specified. I.e. !this.userConfig.edm4eicEventSource.value");
        return null;
      }


      if(userInput.startsWith("local://")) {
        userInput = this.urlService.resolveLocalhostUrl(userInput);
      }


      const jsonData = await firstValueFrom(
        this.http.get(userInput, { responseType: 'text' })
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
}
