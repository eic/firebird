import { Injectable } from '@angular/core';
import {ConfigProperty} from "./utils/config-property";

@Injectable({
  providedIn: 'root'
})
export class UserConfigService {

  public selectedGeometry: ConfigProperty<string>;
  public onlyCentralDetector: ConfigProperty<boolean>;
  public eventSource: ConfigProperty<string>;

  constructor() {
    this.selectedGeometry = new ConfigProperty("geometry.selectedGeometry", "epic-central-optimized");
    this.onlyCentralDetector = new ConfigProperty("geometry.onlyCentralDetector", true);
    this.eventSource = new ConfigProperty("events.eventsSource", "recommended");
  }
}
