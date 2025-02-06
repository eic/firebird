import { Injectable } from '@angular/core';
import { ConfigProperty } from '../utils/config-property';

@Injectable({
  providedIn: 'root',
})
export class UserConfigService {
  public selectedGeometry: ConfigProperty<string>;
  public onlyCentralDetector: ConfigProperty<boolean>;
  public dexJsonEventSource: ConfigProperty<string>;
  public edm4eicEventSource: ConfigProperty<string>;
  public localServerUseApi: ConfigProperty<boolean>;
  public localServerUrl: ConfigProperty<string>;

  public clippingEnabled: ConfigProperty<boolean>;
  public clippingStartAngle: ConfigProperty<number>;
  public clippingOpeningAngle: ConfigProperty<number>;
  public uiSelectedTheme: ConfigProperty<string>;

  constructor() {
    this.selectedGeometry = new ConfigProperty('geometry.selectedGeometry', 'epic-central-optimized');
    this.onlyCentralDetector = new ConfigProperty('geometry.onlyCentralDetector', true);
    this.dexJsonEventSource = new ConfigProperty('events.trajectoryEventsSource', '');
    this.edm4eicEventSource = new ConfigProperty('events.edm4eicEventsSource', '');
    this.localServerUseApi = new ConfigProperty('server.useApi', false);
    this.localServerUrl = new ConfigProperty('server.url', 'http://localhost:5454');
    this.clippingEnabled = new ConfigProperty<boolean>('geometry.clippingEnabled', false);
    this.uiSelectedTheme = new ConfigProperty('ui.theme', 'system', undefined,
      /* validator */ (val) => val === 'dark' || val === 'light' || val === 'system'
      );


    this.clippingStartAngle = new ConfigProperty<number>('geometry.clippingStartAngle', 0, undefined,
      /* validator */ (val) => val >= 0 && val <= 360 // Provide an optional validator ensuring 0 <= angle <= 360
    );

    this.clippingOpeningAngle = new ConfigProperty<number>('clipping.openingAngle', 180, undefined,
      /* validator */ (val) => val >= 0 && val <= 360 // Provide an optional validator ensuring 0 <= angle <= 360
    );
  }
}
