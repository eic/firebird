import {Injectable, NgZone} from '@angular/core';
import {ThreeService} from "./three.service";
import {LocalStorageService} from "./local-storage.service";

@Injectable({
  providedIn: 'root'
})
export class CameraConfig {
  constructor(
    private three: ThreeService,
    private localStorage: LocalStorageService,
  )
  {



  }

  get
}
