/**
 * @firebird/example-extension — the whole public surface is one function.
 *
 * This package is the template for experiment extensions: a custom event
 * group (model, worker-safe), its painter (lazily loaded, three.js), and a
 * config key that obeys the full source precedence — all registered through
 * the public `provideFirebird()` API, with zero Firebird-internal imports.
 *
 * An app installs it with one line:
 *
 * ```ts
 * provideFirebird(withFirebirdBuiltins(), withExampleCherenkov())
 * ```
 *
 * Try it: /display?dex=asset://data/example-cherenkov.firebird.json&event=2
 */

import { inject, provideAppInitializer } from '@angular/core';
import {
  ConfigService,
  FirebirdFeature,
  firebirdFeatures,
  withEventGroup,
  withLazyPainter,
} from '@firebird/ng';
import { CherenkovRingGroup, CherenkovRingGroupFactory } from './cherenkov-ring.group';
import { ringStyle } from './ring-style';

export { CherenkovRingGroup, CherenkovRingGroupFactory } from './cherenkov-ring.group';
export type { CherenkovRing } from './cherenkov-ring.group';
export { ringStyle } from './ring-style';

/** Config key for the ring color — settable from yaml, URL, UI, or commands. */
export const RING_COLOR_CONFIG_KEY = 'examples.cherenkov.ringColor';

export function withExampleCherenkov(): FirebirdFeature {
  return firebirdFeatures(
    // Model: teach DEX parsing the 'example.CherenkovRing' type
    withEventGroup(CherenkovRingGroupFactory),

    // Painter: lazily loaded — three.js material code stays out of the initial bundle
    withLazyPainter(CherenkovRingGroup.type, () => import('./cherenkov-ring.painter').then(m => m.CherenkovRingPainter)),

    // Config: declared through the registry, so every source works —
    // defaults < server config.jsonc < localStorage < ?config.examples.cherenkov.ringColor=... < runtime
    {
      providers: [
        provideAppInitializer(() => {
          const property = inject(ConfigService).declare<string>({
            key: RING_COLOR_CONFIG_KEY,
            default: ringStyle.color,
            label: 'Cherenkov ring color',
            group: 'Example extension',
          });
          property.changes$.subscribe(color => { ringStyle.color = color; });
        }),
      ],
    },
  );
}
