/**
 * `provideFirebird()` and the `with*()` feature functions — the composition
 * API through which an application (Firebird's own or an external
 * experiment's) assembles its event display.
 *
 * API shape: one contribution per `with*()` call. Plurality comes from
 * composition — `provideFirebird(...)` is variadic, and
 * `firebirdFeatures(...)` packs features into bundles (experiment packs).
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
// Deep import (initial-bundle file): the core barrel re-exports painter
// modules that pull three.js; event-group.ts is plain TS.
import { registerEventGroupFactory } from '@firebird/core/model/event-group';
import type {
  ComponentPainterConstructor,
  EventGroupFactory,
  GeometryDataLoader,
  EventDataLoader,
} from '@firebird/core';
import {
  EVENT_GROUP_FACTORIES,
  GEOMETRY_LOADERS,
  EVENT_LOADERS,
  LAZY_THREE_EXTENSIONS,
  PAINTERS,
  THREE_EXTENSIONS,
  URL_ALIASES,
  COMMAND_HANDLERS,
} from './tokens';
import type { LazyThreeExtensionLoader, ThreeExtension } from './three-extension';
import type { CommandHandler } from './command-bus.service';
import { ServerConfigService } from '../services/server-config.service';
import { ConfigService } from '../services/config.service';
import { UrlStartupService } from './url-startup.service';

/**
 * A Firebird feature: a set of providers contributed by one `with*()` call.
 * Closed under composition — see `firebirdFeatures()`.
 */
export interface FirebirdFeature {
  providers: Array<Provider | EnvironmentProviders>;
}

/** Config defaults contributed by features (the lowest precedence tier). */
export const CONFIG_DEFAULTS =
  new InjectionToken<Record<string, unknown>[]>('firebird.config-defaults');

/**
 * Composes features into one feature — the mechanism that makes experiment
 * packs possible: `export function withEpic() { return firebirdFeatures(withPainter(...), ...) }`.
 * Falsy entries are skipped so packs can include conditional features.
 */
export function firebirdFeatures(
  ...features: Array<FirebirdFeature | FirebirdFeature[] | false | null | undefined>
): FirebirdFeature {
  const providers: Array<Provider | EnvironmentProviders> = [];
  for (const entry of features) {
    if (!entry) continue;
    for (const feature of Array.isArray(entry) ? entry : [entry]) {
      providers.push(...feature.providers);
    }
  }
  return { providers };
}

/** Registers an event group factory (DEX type decoder). */
export function withEventGroup(factory: Type<EventGroupFactory>): FirebirdFeature {
  return { providers: [{ provide: EVENT_GROUP_FACTORIES, useClass: factory, multi: true }] };
}

/**
 * Registers a painter for a group type. The type comes from
 * `opts.forGroupType`, or from the painter's static `meta.forGroupTypes`.
 */
export function withPainter(
  painterClass: ComponentPainterConstructor,
  opts?: { forGroupType?: string },
): FirebirdFeature {
  const meta = (painterClass as unknown as { meta?: { forGroupTypes?: string[] } }).meta;
  const types = opts?.forGroupType ? [opts.forGroupType] : (meta?.forGroupTypes ?? []);
  if (types.length === 0) {
    throw new Error(`withPainter(${painterClass.name}): pass { forGroupType } or declare static meta.forGroupTypes`);
  }
  return {
    providers: types.map(forGroupType => ({
      provide: PAINTERS,
      useValue: { forGroupType, painterClass },
      multi: true,
    })),
  };
}

/**
 * Registers a painter through a dynamic import, keeping heavy painter code
 * (three.js materials etc.) out of the initial bundle. The class resolves
 * before the first event is painted.
 */
export function withLazyPainter(
  forGroupType: string,
  load: () => Promise<ComponentPainterConstructor>,
): FirebirdFeature {
  return { providers: [{ provide: PAINTERS, useValue: { forGroupType, load }, multi: true }] };
}

/** Registers a rendering-machinery extension (instantiated through DI). */
export function withThreeExtension(extension: Type<ThreeExtension>): FirebirdFeature {
  return { providers: [{ provide: THREE_EXTENSIONS, useClass: extension, multi: true }] };
}

/**
 * Registers a lazily-loaded extension. The dynamic import keeps it out of the
 * initial bundle; it is loaded and initialized after the scene is up.
 */
export function withLazyThreeExtension(load: LazyThreeExtensionLoader): FirebirdFeature {
  return { providers: [{ provide: LAZY_THREE_EXTENSIONS, useValue: load, multi: true }] };
}

/** Registers a geometry format/scheme loader. */
export function withGeometryLoader(loader: Type<GeometryDataLoader>): FirebirdFeature {
  return { providers: [{ provide: GEOMETRY_LOADERS, useClass: loader, multi: true }] };
}

/** Registers an event data format loader. */
export function withEventLoader(loader: Type<EventDataLoader>): FirebirdFeature {
  return { providers: [{ provide: EVENT_LOADERS, useClass: loader, multi: true }] };
}

/** Registers a command handler on the command bus. */
export function withCommandHandler(handler: Type<CommandHandler>): FirebirdFeature {
  return { providers: [{ provide: COMMAND_HANDLERS, useClass: handler, multi: true }] };
}

/** Registers a URL protocol alias, e.g. `withUrlAlias('epic://', 'https://eic.github.io/epic/artifacts/')`. */
export function withUrlAlias(prefix: string, base: string): FirebirdFeature {
  return { providers: [{ provide: URL_ALIASES, useValue: { prefix, base }, multi: true }] };
}

/**
 * Contributes config defaults — the LOWEST tier of the config precedence
 * (defaults < server < localStorage < URL < runtime). A pack configures,
 * never locks: any other source still overrides these values.
 */
export function withConfigDefaults(defaults: Record<string, unknown>): FirebirdFeature {
  return { providers: [{ provide: CONFIG_DEFAULTS, useValue: defaults, multi: true }] };
}

/**
 * Assembles the Firebird event display from features.
 *
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideZonelessChangeDetection(),
 *     provideRouter(routes),
 *     provideHttpClient(withFetch()),
 *     provideFirebird(
 *       withFirebirdBuiltins(),
 *       withUrlAlias('epic://', 'https://eic.github.io/epic/artifacts/'),
 *       withPainter(MyPainter, { forGroupType: 'my.Type' }),
 *     ),
 *   ],
 * };
 * ```
 *
 * Startup order inside the app initializer:
 * 1. Register DI-contributed event group factories into the core registry
 *    (workers call core's `initGroupFactories()` explicitly instead — core stays DI-free).
 * 2. Apply feature-contributed config defaults.
 * 3. Load the server config (server tier of the config precedence).
 * 4. Parse URL query parameters: `config.*` session overrides and startup
 *    commands (`dex`, `geometry`, `event`, `cmd`). Commands are queued and run
 *    by the display page once the scene is ready.
 */
export function provideFirebird(
  ...features: Array<FirebirdFeature | FirebirdFeature[] | false | null | undefined>
): EnvironmentProviders {
  const feature = firebirdFeatures(...features);
  return makeEnvironmentProviders([
    ...feature.providers as Provider[],
    provideAppInitializer(async () => {
      // All injections happen BEFORE any await — the injection context does
      // not survive across async boundaries (NG0203).
      const factories = inject(EVENT_GROUP_FACTORIES, { optional: true }) ?? [];
      const configService = inject(ConfigService);
      const defaultsList = inject(CONFIG_DEFAULTS, { optional: true }) ?? [];
      const serverConfig = inject(ServerConfigService);
      const urlStartup = inject(UrlStartupService);

      for (const factory of factories) {
        registerEventGroupFactory(factory);
      }
      for (const defaults of defaultsList) {
        configService.applyFeatureDefaults(defaults);
      }

      await serverConfig.loadConfig();

      urlStartup.parseCurrentUrl();
    }),
  ]);
}
