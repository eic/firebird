import {APP_INITIALIZER, ApplicationConfig, importProvidersFrom} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import {provideAnimations} from "@angular/platform-browser/animations";
import {FirebirdConfigService} from "./firebird-config.service";
import {provideHttpClient, withFetch} from "@angular/common/http";

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withFetch()),
    {
      provide: APP_INITIALIZER,
      useFactory: configInitializer,
      deps: [FirebirdConfigService],
      multi: true
    }
  ]
};

export function configInitializer(configService: FirebirdConfigService): () => Promise<any> {
  return () => configService.loadConfig();
}
