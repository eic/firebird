# Firebird Data Exchange format (DEX)

DEX is the JSON format Firebird reads and writes. Version: **1.0**.
The machine-readable JSON Schema lives in the repository at
[`dex-schema/firebird-dex-v1.schema.json`](https://github.com/eic/firebird/tree/main/dex-schema);
this page explains the format with annotated examples.

Files produced by older Firebird tools (version 0.04) do not load in the
current frontend. Convert them once:

```bash
pyrobird upgrade old.firebird.json new.firebird.json   # .zip works too
```

## Design in one paragraph

An event is a list of **pieces** — named blocks of typed data (a hits
collection, a set of trajectories, an extension's custom type). Piece entity
data is **columnar**: parallel arrays where the entity id IS the array index.
Columns are declared by the writer, so a simulation file carries only
simulation columns and a reconstruction file adds its own — readers bind to
declared columns, never to a fixed set. **References between pieces are index
columns**: a `refs` declaration names the target piece, and looking up a
reference is a plain array access (`-1` means "no reference"). Data that is
ragged per entity (trajectory point lists) stays nested.

## Top level

```json
{
  "type": "firebird-dex-json",
  "version": "1.0",
  "origin": { "any custom origin info": "here" },
  "events": [ ... ]
}
```

- **type** — always `"firebird-dex-json"`.
- **version** — the DEX format version, `"1.0"`.
- **origin** — free-form provenance: original file name, timestamp,
  producing software, etc.
- **events** — the list of events. An `event` may correspond to a physics
  event, but the technical definition is broader: a container of time-labeled
  data for one displayed time interval.

## Event

```json
{
  "id": "event_0",
  "pieces": [ ... ]
}
```

- **id** — string or integer, unique within the file.
- **pieces** — the data blocks of this event.

## Piece

Every piece has the same base structure:

```jsonc
{
  "name": "BarrelHits",          // unique within the event; refs target this
  "type": "BoxHit",              // selects the reader/painter
  "version": "1.0",              // schema version of this piece type
  "origin": { "type": "edm4eic::TrackerHitData" },   // optional provenance
  "count": 2,                    // number of entities
  "columns": {                   // parallel arrays, entity id == index
    "pos":  [1, 2, 3,  4, 5, 6], // a vector column: flat x,y,z per entity
    "time": [4.1, 5.0]           // a scalar column: one value per entity
  },
  "refs": { }                    // optional, see References
}
```

Column rules:

- A scalar column holds exactly `count` values.
- A fixed-width vector column (a position, a momentum) holds a whole multiple
  of `count` values, flattened: entity `i` of a 3-wide column `pos` is
  `pos[3i], pos[3i+1], pos[3i+2]`.
- A column is homogeneous: numbers for measured values and references,
  strings for labels (like particle names).
- Writers declare only the columns they have. Omitting a column is the
  correct way to say "this data does not exist here" — there are no
  zero-filled placeholder columns.

Piece `type` names: core types use bare names (`BoxHit`, `PointTrajectory`);
extension types use a namespace prefix (`example.CherenkovRing`,
`myexperiment.RpcHit`) to prevent collisions.

## References

A reference is an ordinary integer column plus a `refs` declaration naming
the piece it points into. The value is the entity index in the target piece;
`-1` means "no reference". Readers resolve references by array lookup —
there are no id maps.

```jsonc
{
  "name": "Rings", "type": "example.CherenkovRing", "version": "1.0",
  "count": 3,
  "columns": {
    "center": [0,0,800, 0,0,1600, 0,0,-900],
    "radius": [300, 700, 500],
    "track":  [0, 0, -1]           // rings 0 and 1 belong to trajectory 0
  },
  "refs": { "track": "CentralTracks" }
}
```

The writer guarantees, and the reader checks, that entity id equals array
index — so an index stored today is valid forever within its file.

## BoxHit piece

Box-shaped hits: tracker hits, calorimeter cells.

| Column | Width | Unit | Required | Meaning |
|-----------|-------|------|----------|--------------------------------|
| `pos` | 3 | mm | yes | box center x, y, z |
| `dim` | 3 | mm | yes | box size dx, dy, dz |
| `time` | 1 | ns | no | hit time (drives time animation) |
| `timeError` | 1 | ns | no | time uncertainty |
| `edep` | 1 | GeV | no | energy deposit |
| `edepError` | 1 | GeV | no | energy deposit uncertainty |

```json
{
  "name": "MPGDBarrelRecHits",
  "type": "BoxHit",
  "version": "1.0",
  "origin": { "type": "edm4eic::TrackerHitData", "name": "MPGDBarrelRecHits" },
  "count": 2,
  "columns": {
    "pos":       [-567, -84.1, -908,   368, -424, 406],
    "dim":       [0.05, 0.04, 0.0,     0.05, 0.045, 0.0],
    "time":      [-10.6, 33],
    "timeError": [10.0, 10.0],
    "edep":      [2e-06, 9e-06],
    "edepError": [0.0, 0.0]
  }
}
```

A simulation writer omits the error columns entirely (sim hits have no
measured uncertainties).

## PointTrajectory piece

Polyline trajectories: tracks, MC particle paths. Track parameters are
ordinary columns — a reconstruction writer declares `theta`, `phi`,
`q_over_p`; a simulation writer declares `pdg`, `charge`, momentum
components. The per-trajectory point lists are ragged, so they stay nested
under `points`, with the tuple layout declared by `pointColumns`:

```jsonc
{
  "name": "CentralTrackSegments",
  "type": "PointTrajectory",
  "version": "1.0",
  "origin": { "type": ["edm4eic::TrackPoint", "edm4eic::TrackSegmentData"] },
  "count": 2,
  "columns": {                     // trajectory id == index in every column
    "theta":    [1.57, 0.4],
    "phi":      [0.3, 2.9],
    "q_over_p": [-0.5, 0.2]
  },
  "pointColumns": ["x", "y", "z", "t", "dx", "dy", "dz", "dt"],
  "points": [                      // points[i] belongs to trajectory i
    [ [0,0,0,0, 0,0,0,0], [10,10,10,1, 0,0,0,0] ],
    [ [0,0,0,2, 0,0,0,0], [20,20,20,5, 0,0,0,0] ]
  ]
}
```

Positions are in mm, times in ns. When a `t` point column is present, the
frontend animates partial tracks over time.

## TypeScript event model

The frontend mirrors the format with typed classes in `@firebird/core`
(plain TypeScript, worker-safe, no Angular):

- **DataExchange** — the whole document; `DataExchange.fromDexObj(obj)`
  parses (and rejects non-1.0 versions loudly), `toDexObject()` serializes.
- **Event** — `id` plus `pieces: EventPiece[]`.
- **EventPiece** — abstract base: `name`, `type`, `origin`, `toDexObject()`,
  `timeRange`.
- **EventPieceFactory** — decoder interface: `type` string plus
  `fromDexObject(obj)`; factories register in a piece registry that the
  Event parser consults by `type`.

Piece classes adopt columns as typed arrays. For example `BoxHitPiece` holds
`pos: Float32Array`, `dim: Float32Array`, and nullable `time`/`edep` columns
— there are no per-hit objects, painters read the columns directly. Readers
check column lengths against `count` and throw on malformed files.

### Adding a new piece type

Write a piece class extending `EventPiece`, a factory implementing
`EventPieceFactory`, and a painter — then register them through the
extension system:

```ts
provideFirebird(
  withFirebirdBuiltins(),
  withEventPiece(MyPieceFactory),
  withLazyPainter(MyPiece.type, () => import('./my.painter').then(m => m.MyPainter)),
)
```

The package `packages/firebird-example-extension` in the repository is a
complete working template (custom piece type, painter, config key, sample
file). See [Extension System](/extensions) for the registration API and
bundle rules. In contexts without Angular (web workers, scripts), register
factories explicitly with `registerEventPieceFactory()`.

## Producers

Three writers produce DEX and stay in sync with the schema:

- **pyrobird** — `pyrobird convert` (EDM4eic and EDM4hep ROOT files) and the
  server convert endpoint.
- **dd4hep-plugin** — C++ Geant4 actions writing trajectories during
  simulation.
- **frontend** — `toDexObject()` serialization of the loaded event model.

`pyrobird merge` combines DEX files piece-wise; `pyrobird smooth`
post-processes trajectory points; `pyrobird upgrade` converts 0.04 files.
