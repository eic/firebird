/**
 * `provideFirebird()` and the `with*()` feature functions: the composition
 * API through which an application (Firebird's own or an external
 * experiment's) assembles its event display.
 *
 * API shape: one contribution per `with*()` call. Plurality comes from
 * composition: `provideFirebird(...)` is variadic, and
 * `firebirdFeatures(...)` packs features into bundles (experiment packs).
 *
 * The composition mechanism (feature type, multi-provider plumbing, config
 * layering, command bus, URL startup, server config loading) comes from
 * `@dexvis/app-features`; this file adds Firebird's own extension points,
 * its URL shorthand grammar, and its server config shape.
 */

import {
  EnvironmentProviders,
  Type,
  inject,
  provideAppInitializer,
} from '@angular/core';
import {
  AppFeature,
  AppFeatureInput,
  appFeatures,
  contributeClass,
  contributeValue,
  provideAppFeatures,
  withConfigDefaults,
  withServerConfig,
  withUrlShorthand,
} from '@dexvis/app-features';
// Deep import (initial-bundle file): the core barrel re-exports painter
// modules that pull three.js; event-piece.ts is plain TS.
import { registerEventPieceFactory } from '@dexvis/firebird-core/model/event-piece';
import type {
  PiecePainterConstructor,
  EventPieceFactory,
  GeometryDataLoader,
  EventDataLoader,
  DataCatalog,
} from '@dexvis/firebird-core';
import {
  EVENT_PIECE_FACTORIES,
  GEOMETRY_LOADERS,
  EVENT_LOADERS,
  LAZY_THREE_EXTENSIONS,
  PAINTERS,
  THREE_EXTENSIONS,
  DATA_CATALOGS,
  DATA_SELECTOR_TABS,
  DataSelectorTabRegistration,
} from './tokens';
import type { LazyThreeExtensionLoader, ThreeExtension } from './three-extension';
import { defaultFirebirdConfig } from '../services/server-config';

/**
 * A Firebird feature: a set of providers contributed by one `with*()` call.
 * The same type as `AppFeature` from `@dexvis/app-features`, so features from
 * both compose freely. Closed under composition; see `firebirdFeatures()`.
 */
export type FirebirdFeature = AppFeature;

/**
 * Composes features into one feature. This is the mechanism that makes
 * experiment packs possible:
 * `export function withEpic() { return firebirdFeatures(withPainter(...), ...) }`.
 * Falsy entries are skipped so packs can include conditional features.
 * The same function as `appFeatures()` from `@dexvis/app-features`.
 */
export const firebirdFeatures: (...features: AppFeatureInput[]) => FirebirdFeature = appFeatures;

/** Registers an event group factory (DEX type decoder). */
export function withEventPiece(factory: Type<EventPieceFactory>): FirebirdFeature {
  return contributeClass(EVENT_PIECE_FACTORIES, factory);
}

/**
 * Registers a painter for a group type. The type comes from
 * `opts.forPieceType`, or from the painter's static `meta.forPieceTypes`.
 */
export function withPainter(
  painterClass: PiecePainterConstructor,
  opts?: { forPieceType?: string },
): FirebirdFeature {
  const meta = (painterClass as unknown as { meta?: { forPieceTypes?: string[] } }).meta;
  const types = opts?.forPieceType ? [opts.forPieceType] : (meta?.forPieceTypes ?? []);
  if (types.length === 0) {
    throw new Error(`withPainter(${painterClass.name}): pass { forPieceType } or declare static meta.forPieceTypes`);
  }
  return firebirdFeatures(...types.map(forPieceType => contributeValue(PAINTERS, { forPieceType, painterClass })));
}

/**
 * Registers a painter through a dynamic import, keeping heavy painter code
 * (three.js materials etc.) out of the initial bundle. The class resolves
 * before the first event is painted.
 */
export function withLazyPainter(
  forPieceType: string,
  load: () => Promise<PiecePainterConstructor>,
): FirebirdFeature {
  return contributeValue(PAINTERS, { forPieceType, load });
}

/** Registers a rendering-machinery extension (instantiated through DI). */
export function withThreeExtension(extension: Type<ThreeExtension>): FirebirdFeature {
  return contributeClass(THREE_EXTENSIONS, extension);
}

/**
 * Registers a lazily-loaded extension. The dynamic import keeps it out of the
 * initial bundle; it is loaded and initialized after the scene is up.
 */
export function withLazyThreeExtension(load: LazyThreeExtensionLoader): FirebirdFeature {
  return contributeValue(LAZY_THREE_EXTENSIONS, load);
}

/** Registers a geometry format/scheme loader. */
export function withGeometryLoader(loader: Type<GeometryDataLoader>): FirebirdFeature {
  return contributeClass(GEOMETRY_LOADERS, loader);
}

/** Registers an event data format loader. */
export function withEventLoader(loader: Type<EventDataLoader>): FirebirdFeature {
  return contributeClass(EVENT_LOADERS, loader);
}

/**
 * Contributes datasets to the data selector: named presets (geometry + events),
 * tagged for the physics picker, and URL lists for manual pick. Several
 * contributions merge in registration order; the server's config.jsonc
 * `dataCatalog` and a remote `catalog.url` file add to them at runtime.
 *
 * ```ts
 * withDataCatalog({
 *   facets: [{ key: 'process', label: 'Process', values: { 'dis-nc': { label: 'DIS NC' } } }],
 *   entries: [{ name: 'DIS NC 10x100', geometry: 'epic://tgeo/epic_craterlake.root',
 *               events: 'https://host/nc_10x100.firebird.zip', tags: { process: 'dis-nc', beam: '10x100' } }],
 * })
 * ```
 */
export function withDataCatalog(catalog: DataCatalog): FirebirdFeature {
  return contributeValue(DATA_CATALOGS, catalog);
}

/**
 * Adds a tab to the data selector control. The component must be a dynamic
 * import (tab UI pulls Material/forms code that must stay out of the initial
 * bundle); it reads and writes the shared `DataSelectionService.draft`.
 *
 * ```ts
 * withDataSelectorTab({ id: 'campaigns', label: 'Campaigns', order: 15,
 *   load: () => import('./campaigns-tab.component').then(m => m.CampaignsTabComponent) })
 * ```
 */
export function withDataSelectorTab(tab: DataSelectorTabRegistration): FirebirdFeature {
  return contributeValue(DATA_SELECTOR_TABS, tab);
}

/**
 * Sets the detector geometry the display loads when nothing else selects one.
 * Sugar for `withConfigDefaults({'geometry.selectedGeometry': url})` — the
 * same precedence applies, so server config, a saved user choice, and
 * `?geometry=` deep links all override it.
 */
export function withDefaultGeometry(url: string): FirebirdFeature {
  return withConfigDefaults({ 'geometry.selectedGeometry': url });
}

/**
 * Firebird's URL shorthand grammar: `?geometry=<url>`, `?dex=<url>` and
 * `?event=<N>` stand for `?cmd=open-geometry:<url>`, `?cmd=open-dex:<url>`
 * and `?cmd=show-event:<N>`, queued in this order before the generic `?cmd=`
 * list. The command handlers (`withFirebirdBuiltins()`) build the commands.
 * `provideFirebird()` includes it.
 */
export function withFirebirdUrlShorthands(): FirebirdFeature {
  return firebirdFeatures(
    withUrlShorthand('geometry', 'open-geometry'),
    withUrlShorthand('dex', 'open-dex'),
    withUrlShorthand('event', 'show-event'),
  );
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
 *       withPainter(MyPainter, { forPieceType: 'my.Type' }),
 *     ),
 *   ],
 * };
 * ```
 *
 * Startup order inside the app initializers (after the initializers that
 * features contribute):
 * 1. Register DI-contributed event group factories into the core registry
 *    (workers call core's `initPieceFactories()` explicitly instead; core stays DI-free).
 * 2. Apply feature-contributed config defaults.
 * 3. Load the server config (server tier of the config precedence).
 * 4. Parse URL query parameters: `config.*` session overrides and startup
 *    commands (`dex`, `geometry`, `event`, `cmd`). Commands are queued and run
 *    by the display page once the scene is ready.
 *
 * Steps 2-4 are `provideAppFeatures()` from `@dexvis/app-features`.
 */
export function provideFirebird(...features: AppFeatureInput[]): EnvironmentProviders {
  return provideAppFeatures(
    withServerConfig({ defaults: defaultFirebirdConfig }),
    withFirebirdUrlShorthands(),
    ...features,
    {
      providers: [provideAppInitializer(() => {
        const factories = inject(EVENT_PIECE_FACTORIES, { optional: true }) ?? [];
        for (const factory of factories) {
          registerEventPieceFactory(factory);
        }
      })],
    },
  );
}
