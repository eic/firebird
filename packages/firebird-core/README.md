# @dexvis/firebird-core

The worker-safe core of the Firebird event display: the event model, DEX io,
loader contracts, data catalog types and painters. Plain TypeScript with no
Angular injector and no bootstrap, so web workers, node scripts and the
Angular application run the same code. It uses Angular signals (peer
`@angular/core`) and renders with three.js (peer `three`).

```bash
npm install @dexvis/firebird-core @angular/core three
```

## Subpaths

| Import | Holds | Imports three.js |
|---|---|---|
| `@dexvis/firebird-core` | everything below, plus the painters | yes |
| `@dexvis/firebird-core/model` | event model, DEX io, piece factory registry | no |
| `@dexvis/firebird-core/loaders` | loader contracts, `matchesFileExtensions`, `sourceName` | types only |
| `@dexvis/firebird-core/data-catalog` | data catalog types and merge helpers | no |

A class is the same class whichever subpath imports it. In modules an
application loads at startup, import the subpaths: the root pulls three.js
in through the painters.

## Paint an event without DI

Registration is explicit; importing the package has no side effects.

```ts
import { Scene } from 'three';
import { DataExchange, DataModelPainter, initPieceFactories, registerDefaultPainters } from '@dexvis/firebird-core';

initPieceFactories();
const dex = DataExchange.fromDexObj(dexDocument);   // a parsed DEX 1.0 document

const scene = new Scene();
const painter = new DataModelPainter();
registerDefaultPainters(painter);
painter.setThreeSceneParent(scene);
painter.setEntry(dex.events[0]);
painter.paint(null);                                 // null: draw everything, no time filter
```

A custom piece type extends `EventPiece` with a factory registered through
`registerEventPieceFactory()`, and a custom painter extends
`EventPiecePainter`. The base `dispose()` frees the geometries and materials
of everything under the painter's node; override it only to free resources
held elsewhere, and call `super.dispose()`.

## Build and test

```bash
npm test -w @dexvis/firebird-core
npm run build -w @dexvis/firebird-core     # dist/ with one bundled .d.ts per subpath
```
