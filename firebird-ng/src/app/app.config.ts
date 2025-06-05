import {
  ApplicationConfig,
  inject,
  provideAppInitializer
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import {provideAnimations} from "@angular/platform-browser/animations";
import {ServerConfigService} from "./services/server-config.service";
import {provideHttpClient, withFetch} from "@angular/common/http";

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withFetch()),
    provideAppInitializer(() => {
        const initializerFn = (configInitializer)(inject(ServerConfigService));
        return initializerFn();
      })
  ]
};

export function configInitializer(configService: ServerConfigService): () => Promise<any> {
  return () => configService.loadConfig();
}
