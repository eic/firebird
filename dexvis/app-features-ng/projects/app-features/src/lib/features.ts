/**
 * Feature composition: the `with*()` functions and `provideAppFeatures()`,
 * through which an application assembles itself from features and feature
 * packs.
 *
 * API shape: one contribution per `with*()` call. Plurality comes from
 * composition: `provideAppFeatures(...)` is variadic, and `appFeatures(...)`
 * packs features into bundles that ship as one function.
 */

import {
  EnvironmentProviders,
  InjectionToken,
  Provider,
  Type,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { ConfigService } from './config.service';
import { ServerConfigBase, ServerConfigService } from './server-config.service';
import { UrlStartupService } from './url-startup.service';
import type { CommandHandler } from './command-bus.service';
import {
  COMMAND_HANDLERS,
  CONFIG_DEFAULTS,
  CONFIG_STORAGE_OPTIONS,
  type ConfigStorageOptions,
  SERVER_CONFIG_OPTIONS,
  URL_ALIASES,
  URL_SHORTHANDS,
} from './tokens';

/**
 * A feature: the providers contributed by one `with*()` call.
 * Closed under composition; see `appFeatures()`.
 */
export interface AppFeature {
  providers: Array<Provider | EnvironmentProviders>;
}

/**
 * What the composition functions accept: a feature, an array of features, or
 * a falsy value (skipped), so packs can include conditional features:
 * `appFeatures(withA(), debug && withB())`.
 */
export type AppFeatureInput = AppFeature | AppFeature[] | false | null | undefined;

/**
 * Composes features into one feature. This is what makes feature packs
 * possible: `export function withMyPack() { return appFeatures(withA(), withB()); }`.
 * Falsy entries are skipped; provider order follows argument order.
 */
export function appFeatures(...features: AppFeatureInput[]): AppFeature {
  const providers: Array<Provider | EnvironmentProviders> = [];
  for (const entry of features) {
    if (!entry) continue;
    for (const feature of Array.isArray(entry) ? entry : [entry]) {
      providers.push(...feature.providers);
    }
  }
  return { providers };
}

/**
 * Contributes one value to a multi-provider token. Use it to write an
 * application's own `with*()` functions:
 *
 * ```ts
 * export const WIDGETS = new InjectionToken<Widget[]>('my-app.widgets');
 * export function withWidget(widget: Widget): AppFeature {
 *   return contributeValue(WIDGETS, widget);
 * }
 * ```
 */
export function contributeValue<T>(token: InjectionToken<T[]>, value: T): AppFeature {
  return { providers: [{ provide: token, useValue: value, multi: true }] };
}

/**
 * Contributes one class, instantiated through DI, to a multi-provider token.
 * The class may `inject()` services.
 */
export function contributeClass<T>(token: InjectionToken<T[]>, implementation: Type<T>): AppFeature {
  return { providers: [{ provide: token, useClass: implementation, multi: true }] };
}

/**
 * Contributes config defaults: the LOWEST tier of the config precedence
 * (defaults < server < localStorage < URL < runtime). A pack configures,
 * never locks: any other source still overrides these values.
 */
export function withConfigDefaults(defaults: Record<string, unknown>): AppFeature {
  return contributeValue(CONFIG_DEFAULTS, defaults);
}

/** Registers a command handler on the command bus. */
export function withCommandHandler(handler: Type<CommandHandler>): AppFeature {
  return contributeClass(COMMAND_HANDLERS, handler);
}

/** Registers a URL protocol alias, for example `withUrlAlias('data://', 'https://host/data/')`. */
export function withUrlAlias(prefix: string, base: string): AppFeature {
  return contributeValue(URL_ALIASES, { prefix, base });
}

/**
 * Registers a URL query shorthand: `?<param>=<value>` queues the same
 * startup command as `?cmd=<commandType>:<value>`, built by the handler's
 * `fromUrlArg()`. Shorthands apply in registration order, before the generic
 * `?cmd=` list.
 *
 * ```ts
 * withUrlShorthand('file', 'open-file')   // ?file=<url> = ?cmd=open-file:<url>
 * ```
 */
export function withUrlShorthand(param: string, commandType: string): AppFeature {
  return contributeValue(URL_SHORTHANDS, { param, commandType });
}

/**
 * Sets where the server config is fetched from and the values it is merged
 * over. One setting per application: the last `withServerConfig()` wins.
 */
export function withServerConfig<T extends object>(options: { url?: string; defaults?: T & ServerConfigBase }): AppFeature {
  return { providers: [{ provide: SERVER_CONFIG_OPTIONS, useValue: options }] };
}

/**
 * Sets how the config registry stores the localStorage layer. One setting
 * per application: the last `withConfigStorage()` wins.
 *
 * ```ts
 * withConfigStorage({ prefix: 'eiceye.' })   // stores 'viewer.theme' as 'eiceye.viewer.theme'
 * ```
 *
 * The prefix applies to every property the `ConfigService` creates
 * (`declare()`, `getConfigOrCreate()`, `createConfig()`). A property you
 * construct yourself and pass to `addConfig()` keeps the storage you gave it.
 */
export function withConfigStorage(options: ConfigStorageOptions): AppFeature {
  return { providers: [{ provide: CONFIG_STORAGE_OPTIONS, useValue: options }] };
}

/**
 * Assembles an application from features and adds the startup sequence.
 *
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideZonelessChangeDetection(),
 *     provideHttpClient(withFetch()),
 *     provideAppFeatures(
 *       withServerConfig({ defaults: { apiBaseUrl: '' } }),
 *       withUrlShorthand('file', 'open-file'),
 *       withCommandHandler(OpenFileCommandHandler),
 *     ),
 *   ],
 * };
 * ```
 *
 * Startup order inside the app initializer (after the initializers that
 * features contribute):
 * 1. Apply feature-contributed config defaults.
 * 2. Load the server config (server tier of the config precedence).
 * 3. Parse URL query parameters: `config.*` session overrides and startup
 *    commands (shorthands and `?cmd=`). Commands are queued and run by the
 *    page that calls `CommandBusService.runStartupCommands()`.
 *
 * Requires `HttpClient` (`provideHttpClient()`).
 */
export function provideAppFeatures(...features: AppFeatureInput[]): EnvironmentProviders {
  const feature = appFeatures(...features);
  return makeEnvironmentProviders([
    ...feature.providers,
    provideAppInitializer(async () => {
      // All injections happen BEFORE any await: the injection context does
      // not survive across async boundaries (NG0203).
      const configService = inject(ConfigService);
      const defaultsList = inject(CONFIG_DEFAULTS, { optional: true }) ?? [];
      const serverConfig = inject(ServerConfigService);
      const urlStartup = inject(UrlStartupService);

      for (const defaults of defaultsList) {
        configService.applyFeatureDefaults(defaults);
      }

      await serverConfig.loadConfig();

      urlStartup.parseCurrentUrl();
    }),
  ]);
}
