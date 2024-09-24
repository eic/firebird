import { Injectable } from '@angular/core';
import {ConfigProperty} from "../utils/config-property";

@Injectable({
  providedIn: 'root'
})
export class UserConfigService {

  public selectedGeometry: ConfigProperty<string>;
  public onlyCentralDetector: ConfigProperty<boolean>;
  public trajectoryEventSource: ConfigProperty<string>;
  public edm4eicEventSource: ConfigProperty<string>;
  public localServerUseApi: ConfigProperty<boolean>;
  public localServerHost: ConfigProperty<string>;
  public localServerPort: ConfigProperty<number>;

  constructor() {
    this.selectedGeometry = new ConfigProperty("geometry.selectedGeometry", "epic-central-optimized");
    this.onlyCentralDetector = new ConfigProperty("geometry.onlyCentralDetector", true);
    this.trajectoryEventSource = new ConfigProperty("events.trajectoryEventsSource", "");
    this.edm4eicEventSource = new ConfigProperty("events.edm4eicEventsSource", "");
    this.localServerUseApi = new ConfigProperty("server.useApi", false);
    this.localServerHost = new ConfigProperty("server.host", "localhost");
    this.localServerPort = new ConfigProperty("server.port", 5454);
  }
}
