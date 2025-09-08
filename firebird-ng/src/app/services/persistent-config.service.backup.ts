import { Injectable } from '@angular/core';
import {ConfigProperty} from '../utils/config-property';

@Injectable({
  providedIn: 'root',
})
export class PersistentConfigService {
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

  //public clippingEnabled: PersistentProperty<boolean>;
  public clippingStartAngle: ConfigProperty<number>;
  public clippingOpeningAngle: ConfigProperty<number>;
  public uiSelectedTheme: ConfigProperty<string>;
  public useController: ConfigProperty<boolean>;

  public configsByName: Map<string, ConfigProperty<any>> = new Map();

  // Generic getter with type safety
  public getConfig<T>(key: string): ConfigProperty<T> | undefined {
    return this.configsByName.get(key) as ConfigProperty<T> | undefined;
  }

  // Generic getter that throws if property doesn't exist
  public getConfigOrThrow<T>(key: string): ConfigProperty<T> {
    const property = this.configsByName.get(key);
    if (!property) {
      throw new Error(`Property '${key}' not found`);
    }
    return property as ConfigProperty<T>;
  }

  // Register a property
  public addConfig<T>(key: string, property: ConfigProperty<T>): void {
    this.configsByName.set(key, property);
  }


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
    //this.clippingEnabled = new PersistentProperty<boolean>('geometry.clippingEnabled', true);

    this.configsByName.set('geometry.clippingEnabled', new ConfigProperty<boolean>('geometry.clippingEnabled', true));

    this.uiSelectedTheme = new ConfigProperty('ui.theme', 'system', undefined,
      /* validator */ (val) => val === 'dark' || val === 'light' || val === 'system'
      );


    this.clippingStartAngle = new ConfigProperty<number>('geometry.clippingStartAngle', 90, undefined,
      /* validator */ (val) => val >= 0 && val <= 360 // Provide an optional validator ensuring 0 <= angle <= 360
    );

    this.clippingOpeningAngle = new ConfigProperty<number>('clipping.openingAngle', 180, undefined,
      /* validator */ (val) => val >= 0 && val <= 360 // Provide an optional validator ensuring 0 <= angle <= 360
    );

    this.useController = new ConfigProperty<boolean>('controls.useController', false);
  }

  get clippingEnabled(): ConfigProperty<boolean> {
    return this.configsByName.get('geometry.clippingEnabled') as ConfigProperty<boolean>;
  }

}
