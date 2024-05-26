import { Injectable } from '@angular/core';
import {ConfigProperty} from "./utils/config-property";

@Injectable({
  providedIn: 'root'
})
export class UserConfigService {

  public selectedGeometry: ConfigProperty<string>;

  constructor() {
    this.selectedGeometry = new ConfigProperty("selectedGeometry", "epic-central-optimized");
  }
}
