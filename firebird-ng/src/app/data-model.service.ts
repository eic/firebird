import {Injectable} from "@angular/core";
import {UserConfigService} from "./user-config.service";
import {Object3D} from "three";

@Injectable({
  providedIn: 'root'
})
export class DataModelService {
  constructor(private settings: UserConfigService) {

  }

  async loadData(): Promise<{eventData: any|null, threeObject: Object3D|null}> {
    let eventData = null;
    let threeObject = null;
    return {eventData: eventData, threeObject: threeObject}
  }
}
