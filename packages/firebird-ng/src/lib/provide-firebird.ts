/**
 * `provideFirebird()`: assembles the event display from Firebird's built-ins
 * and the application's features.
 */

import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import {
  APP_FEATURE_OWNERS,
  AppFeatureInput,
  provideAppFeatures,
  resolveRegistry,
} from '@dexvis/app-features';
// The /model subpath (initial-bundle file): the core root re-exports the
// painters, which pull three.js; the model imports none.
import { registerEventPieceFactory } from '@dexvis/firebird-core/model';
import type { EventPieceFactory } from '@dexvis/firebird-core';
import { EVENT_PIECE_FACTORIES } from '@dexvis/firebird-ng/api';
import { withFirebirdBuiltins } from './with-firebird-builtins';

/**
 * Development-build warning: two packs ship different factory classes for
 * one piece type. Only the last one takes effect, which is rarely what both
 * packs intend. Replacing a built-in factory is no collision: the built-ins
 * are a pack of defaults, and `owners` has no entry for them.
 */
function warnPieceTypeCollisions(factories: readonly EventPieceFactory[], owners: ReadonlyMap<unknown, readonly string[]>): void {
  const classesByType = new Map<string, Set<Function>>();
  for (const factory of factories) {
    const classes = classesByType.get(factory.type) ?? new Set<Function>();
    classes.add(factory.constructor);
    classesByType.set(factory.type, classes);
  }
  for (const [type, classes] of classesByType) {
    if (classes.size < 2) continue;
    const packs = new Set([...classes].flatMap(factoryClass => owners.get(factoryClass) ?? []));
    if (packs.size < 2) continue;
    const sources = [...classes]
      .filter(factoryClass => owners.has(factoryClass))
      .map(factoryClass => `${factoryClass.name} (${owners.get(factoryClass)!.join(', ')})`);
    // A piece factory feature has no id: dropping one of them means dropping its pack
    console.warn(`[Firebird] Piece type '${type}' has factories from several packs: ${sources.join(', ')}. ` +
      `The last one decodes it. To keep another one, change the order of the packs or drop a pack with withoutFeatures('<pack id>').`);
  }
}

/**
 * Assembles the Firebird event display: Firebird's built-ins
 * (`withFirebirdBuiltins()`), then the application's features.
 *
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideZonelessChangeDetection(),
 *     provideRouter(routes),
 *     provideHttpClient(withFetch()),
 *     provideFirebird(
 *       withMyExperiment(),
 *       withoutFeatures('firebird.navigation-cube'),
 *     ),
 *   ],
 * };
 * ```
 *
 * The built-ins are installed first, so registration order puts them ahead
 * of the application's features. To drop a part of them, pass
 * `withoutFeatures()` with the part's feature id (see
 * with-firebird-builtins.ts); to replace one, register under its id.
 *
 * Startup order inside the app initializers (after the initializers that
 * features contribute):
 * 1. Register DI-contributed event piece factories into the core registry
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
    withFirebirdBuiltins(),
    ...features,
    {
      kind: 'initializer',
      providers: [provideAppInitializer(() => {
        const factories = inject(EVENT_PIECE_FACTORIES, { optional: true }) ?? [];
        if (typeof ngDevMode !== 'undefined' && ngDevMode) {
          warnPieceTypeCollisions(factories, inject(APP_FEATURE_OWNERS, { optional: true }) ?? new Map());
        }
        for (const factory of resolveRegistry(factories, factory => factory.type)) {
          registerEventPieceFactory(factory);
        }
      })],
    },
  );
}
