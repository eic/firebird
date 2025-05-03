import { Injectable, Type } from '@angular/core';
import { PainterConfig } from '../painter-config.interface';
import { ConfiguratorComponent } from './configurator.component';

@Injectable({ providedIn: 'root' })
export class ConfiguratorRegistryService {
  private registry = new Map<string, Type<ConfiguratorComponent<any>>>();

  register<T extends PainterConfig>(
    configType: string,
    component: Type<ConfiguratorComponent<T>>
  ): void {
    this.registry.set(configType, component);
  }

  getComponent<T extends PainterConfig>(configType: string): Type<ConfiguratorComponent<T>> | undefined {
    return this.registry.get(configType);
  }
}
