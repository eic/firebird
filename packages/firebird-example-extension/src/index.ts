/**
 * @dexvis/firebird-example-extension: the whole public surface is one
 * function.
 *
 * This package is the template for experiment extensions: a custom event
 * piece (model, worker-safe) and its painter (lazily loaded, three.js) with
 * a configurable ring color, all registered through the public
 * `provideFirebird()` API, with zero Firebird-internal imports.
 *
 * An app installs it with one line:
 *
 * ```ts
 * provideFirebird(withExampleCherenkov())
 * ```
 *
 * Try it: /display?dex=asset://data/example-cherenkov.firebird.json&event=2
 *
 * Settings belong to the painter: the ring color is a knob in the painter's
 * `static meta.configs`. Firebird turns it into the config key
 * `painters.byPiece.<pieceName>.ringColor` (for the sample:
 * `painters.byPiece.ExampleRings.ringColor`), shows it in the painter
 * panel, applies the normal config precedence (pack defaults < server
 * config.jsonc < saved choice < `?config.` URL value < runtime), and calls
 * the painter's `onConfigChanged()` on every change.
 */

import {
  FirebirdFeature,
  firebirdPack,
  withEventPiece,
  withLazyPainter,
} from '@dexvis/firebird-ng';
import { CherenkovRingPiece, CherenkovRingPieceFactory } from './cherenkov-ring.piece';

export { CherenkovRingPiece, CherenkovRingPieceFactory } from './cherenkov-ring.piece';

export function withExampleCherenkov(): FirebirdFeature {
  return firebirdPack('example-cherenkov',
    // Model: teach DEX parsing the 'example.CherenkovRing' type
    withEventPiece(CherenkovRingPieceFactory),

    // Painter: lazily loaded, so three.js material code stays out of the initial bundle
    withLazyPainter(CherenkovRingPiece.type, () => import('./cherenkov-ring.painter').then(m => m.CherenkovRingPainter)),
  );
}
