import { Injectable } from '@angular/core';
import { ConfigProperty } from '../utils/config-property';

@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  public geometryUrl: ConfigProperty<string>;
  public geometryThemeName: ConfigProperty<string>;
  public geometryCutListName: ConfigProperty<string>;
  public geometryFastAndUgly: ConfigProperty<boolean>;
  public geometryRootFilterName: ConfigProperty<string>;
  public dexJsonEventSource: ConfigProperty<string>;
  public rootEventSource: ConfigProperty<string>;
  public rootEventRange: ConfigProperty<string>;
  public localServerUseApi: ConfigProperty<boolean>;
  public localServerUrl: ConfigProperty<string>;

  public clippingEnabled: ConfigProperty<boolean>;
  public clippingStartAngle: ConfigProperty<number>;
  public clippingOpeningAngle: ConfigProperty<number>;
  public uiSelectedTheme: ConfigProperty<string>;


  constructor() {
    this.geometryUrl = new ConfigProperty('geometry.selectedGeometry', 'https://eic.github.io/epic/artifacts/tgeo/epic_craterlake.root');
    this.geometryFastAndUgly = new ConfigProperty('geometry.FastDefaultMaterial', false);
    this.geometryCutListName = new ConfigProperty('geometry.cutListName', "central");
    this.geometryThemeName = new ConfigProperty('geometry.themeName', "cool2");
    this.geometryRootFilterName = new ConfigProperty('geometry.rootFilterName', "default");
    this.dexJsonEventSource = new ConfigProperty('events.dexEventsSource', '');
    this.rootEventSource = new ConfigProperty('events.rootEventSource', '');
    this.rootEventRange = new ConfigProperty('events.rootEventRange', '0-5');
    this.localServerUseApi = new ConfigProperty('server.useApi', false);
    this.localServerUrl = new ConfigProperty('server.url', 'http://localhost:5454');
    this.clippingEnabled = new ConfigProperty<boolean>('geometry.clippingEnabled', true);
    this.uiSelectedTheme = new ConfigProperty('ui.theme', 'system', undefined,
      /* validator */ (val) => val === 'dark' || val === 'light' || val === 'system'
      );


    this.clippingStartAngle = new ConfigProperty<number>('geometry.clippingStartAngle', 90, undefined,
      /* validator */ (val) => val >= 0 && val <= 360 // Provide an optional validator ensuring 0 <= angle <= 360
    );

    this.clippingOpeningAngle = new ConfigProperty<number>('clipping.openingAngle', 180, undefined,
      /* validator */ (val) => val >= 0 && val <= 360 // Provide an optional validator ensuring 0 <= angle <= 360
    );
  }
}
