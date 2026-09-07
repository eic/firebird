# @firebird/root2dex

Converts EDM4eic / EDM4hep podio ROOT files to Firebird DEX, in the browser or
in node, through the JSROOT API.

This is the TypeScript twin of `pyrobird convert`. For the same input file and
the same entries the two produce the same DEX document, value for value —
`src/parity.spec.ts` pins that against reference documents written by pyrobird.

```ts
import { Root2DexConverter } from '@firebird/root2dex';

const converter = await Root2DexConverter.open(file);   // File, URL, path, or byte-range source
console.log(converter.model, converter.entryCount);      // 'edm4eic' | 'edm4hep', number of events
const dex = await converter.convert(eventNumber);        // a DEX 1.0 document
```

One-shot form, equivalent to the CLI:

```ts
const dex = await convertRootToDex('https://host/reco.edm4eic.root', '0-4');
```

## Only the requested event is read

Event files are routinely many GB, so nothing ever loads the whole file.
JSROOT reads the key directory, the streamer info and the TTree metadata when
the file is opened, and after that only the baskets covering the requested
entry. Measured on the repository's test files:

| file | size | open | per event |
|---|---|---|---|
| `reco_2024-09_craterlake_2evt.edm4eic.root` | 0.94 MB | 0.26 MB | 22 kB |
| `k_lambda_10x100_2evt.edm4hep.root` | 1.22 MB | 0.05 MB | 29 kB |

The open cost is paid once per file, not once per event, which is why
`Root2DexConverter` keeps the file open. All the branches an event needs are
read in ONE `treeProcess` pass so their baskets go out as few requests — a pass
per column would multiply the round trips by the number of columns.

Sources `Root2DexConverter.open` accepts:

- a browser `File` (file picker or drag-and-drop) — read with `Blob.slice`
- an `http(s)` URL — HTTP Range requests
- a path or `file://` URL under node
- anything built with `createByteRangeSource()` — you supply
  `readRange(pos, len)`, and optionally `readRanges([...])` when the transport
  can answer several ranges in one round trip. This is where a remote XRootD
  byte-range proxy plugs in; nothing else in the package changes.

## What is converted

Matching pyrobird's `edm4eic.py` and `edm4hep.py`:

**edm4eic** (`tracker_hits`, `tracks`)
- every `vector<edm4eic::TrackerHitData>` collection → a `BoxHit` piece, box
  dimensions from `positionError` (±1σ). Empty collections are kept as count-0
  pieces.
- `CentralTrackSegments` + its `TrackPoint`s → one `PointTrajectory` piece,
  parameters taken positionally from `CentralCKFTrackParameters` (the one-to-one
  relation to Track cannot be followed — EICrecon issue #1730).

**edm4hep** (`tracker_hits`, `mc_trajectories`)
- every `vector<edm4hep::SimTrackerHitData>` collection → a `BoxHit` piece with
  a fixed box size (sim hits carry no errors). Collections empty in this event
  are dropped.
- MC-truth trajectories: hits pooled across collections, grouped by their
  `MCParticle`, sorted by time, one `PointTrajectory` piece. Cherenkov/PID
  collections are excluded from trajectory building by default (their photon
  hits are attributed to the emitting charged particle and would draw zigzags);
  they still appear as `BoxHit` pieces.

The data model is detected from the branch types — files carrying both win as
`edm4eic` — and can be overridden with the `model` option.

## Tests

```bash
npm test -w @firebird/root2dex
```

The specs read pyrobird's test ROOT files from `pyrobird/tests/unit_tests/data`
and the reference DEX documents in `test-data/`; they skip themselves when
those files are absent.
