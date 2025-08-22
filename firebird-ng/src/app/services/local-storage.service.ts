import { Injectable } from '@angular/core';
import {ConfigPropertyBase, PersistentProperty} from '../utils/persistent-property';

@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  public geometryUrl: PersistentProperty<string>;
  public geometryThemeName: PersistentProperty<string>;
  public geometryCutListName: PersistentProperty<string>;
  public geometryFastAndUgly: PersistentProperty<boolean>;
  public geometryRootFilterName: PersistentProperty<string>;
  public dexJsonEventSource: PersistentProperty<string>;
  public rootEventSource: PersistentProperty<string>;
  public rootEventRange: PersistentProperty<string>;
  public localServerUseApi: PersistentProperty<boolean>;
  public localServerUrl: PersistentProperty<string>;

  //public clippingEnabled: PersistentProperty<boolean>;
  public clippingStartAngle: PersistentProperty<number>;
  public clippingOpeningAngle: PersistentProperty<number>;
  public uiSelectedTheme: PersistentProperty<string>;
  public useController: PersistentProperty<boolean>;

  public propertiesByName:  Map<string, PersistentProperty<unknown>> = new Map<string, PersistentProperty<unknown>>();


  constructor() {


    this.geometryUrl = new PersistentProperty('geometry.selectedGeometry', 'https://eic.github.io/epic/artifacts/tgeo/epic_craterlake.root');
    this.geometryFastAndUgly = new PersistentProperty('geometry.FastDefaultMaterial', false);
    this.geometryCutListName = new PersistentProperty('geometry.cutListName', "central");
    this.geometryThemeName = new PersistentProperty('geometry.themeName', "cool2");
    this.geometryRootFilterName = new PersistentProperty('geometry.rootFilterName', "default");
    this.dexJsonEventSource = new PersistentProperty('events.dexEventsSource', '');
    this.rootEventSource = new PersistentProperty('events.rootEventSource', '');
    this.rootEventRange = new PersistentProperty('events.rootEventRange', '0-5');
    this.localServerUseApi = new PersistentProperty('server.useApi', false);
    this.localServerUrl = new PersistentProperty('server.url', 'http://localhost:5454');
    //this.clippingEnabled = new PersistentProperty<boolean>('geometry.clippingEnabled', true);
    this.propertiesByName.set('geometry.clippingEnabled', new PersistentProperty<boolean>('geometry.clippingEnabled', true));
    this.uiSelectedTheme = new PersistentProperty('ui.theme', 'system', undefined,
      /* validator */ (val) => val === 'dark' || val === 'light' || val === 'system'
      );


    this.clippingStartAngle = new PersistentProperty<number>('geometry.clippingStartAngle', 90, undefined,
      /* validator */ (val) => val >= 0 && val <= 360 // Provide an optional validator ensuring 0 <= angle <= 360
    );

    this.clippingOpeningAngle = new PersistentProperty<number>('clipping.openingAngle', 180, undefined,
      /* validator */ (val) => val >= 0 && val <= 360 // Provide an optional validator ensuring 0 <= angle <= 360
    );

    this.useController = new PersistentProperty<boolean>('controls.useController', false);
  }

  get clippingEnabled(): PersistentProperty<boolean> {
    return this.propertiesByName.get('geometry.clippingEnabled') as PersistentProperty<boolean>;
  }

}
