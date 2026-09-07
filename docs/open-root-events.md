# Opening ROOT files in the browser

Firebird can read an EDM4eic or EDM4hep ROOT file straight from your computer,
or from a URL, and show its events — no server, no conversion step, no upload.

## Using the panel

1. Press the **folder** button in the top bar. A panel drops down.
2. Give it a file: drop a `.root` or `.firebird.json`/`.firebird.zip` file on
   the panel, click the drop zone to pick one, or paste a `https://` URL.
3. Firebird looks inside and decides what the file is:
   - a **detector geometry** loads immediately;
   - a **DEX event file** loads all its events immediately — pick one in the
     toolbar event selector;
   - a **ROOT event file** reports its data model (`edm4eic` or `edm4hep`) and
     how many events it holds, and offers the event picker.
4. For a ROOT file, type which events you want and press **Show**.

The **Events** box takes a single number, a list, or a range — `3`, `0,2,4-5`,
`10-19`. Everything you ask for lands in the event selector in the toolbar, so
the usual next/previous controls step through them. Asking again is fast: the
file stays open.

The **Convert** checkboxes choose which collection groups the conversion
produces — tracker hits, tracks, MC particles. They list what the opened
file's data model offers, and all groups start on. Unchecking a group leaves
it out of the converted event; press **Show** again to re-convert with a
different choice.

## Deep links

`?dex=` accepts a ROOT URL, so a link can carry a whole view:

```
/display?geometry=epic://tgeo/epic_craterlake.root
        &dex=https://example.org/reco.edm4eic.root
        &config.events.rootEventRange=0-4
```

`config.events.rootEventRange` chooses the events, exactly like the panel's
Events box. `config.events.rootCollections` chooses the collection groups,
exactly like the panel's Convert checkboxes — a comma-separated list such as
`tracker_hits,mc_particles`; leave it out (or empty) for all groups. The URL
must be reachable by your browser and its server must answer HTTP Range
requests — which is how only the needed bytes are fetched.

## The file is not uploaded, and not even fully read

A local file never leaves your computer, and Firebird does not load it into
memory either: it reads the file's directory and tree structure once, and after
that only the compressed blocks that hold the events you asked for. Converting
one event of the reference test files costs 20–30 kB of reading. Multi-GB files
work the same way as small ones, over a URL just as much as from disk.

That means the cost of "show event 5000" does not grow with the size of the
file.

## Which converter runs

| Source | Converted by |
|---|---|
| A file you picked or dropped | your browser |
| `http(s)://…/file.root` | your browser (HTTP Range) |
| `root://…` (XRootD) | pyrobird, which opens the remote file and converts |
| A path served by pyrobird | pyrobird |

XRootD access is unchanged: those URLs go to the server exactly as before. If
you would rather always convert server-side, set `events.rootConverter` to
`server`.

## What you get

The conversion is the same one `pyrobird convert` performs, so the picture is
the same whether the file went through the Python CLI or through the browser:

- **EDM4eic** — every `TrackerHitData` collection becomes a box-hit piece
  (box size from the hit's position error), and `CentralTrackSegments` becomes
  trajectories with their track parameters.
- **EDM4hep** — every `SimTrackerHitData` collection becomes a box-hit piece
  with a fixed box size (simulation hits carry no errors), plus MC-truth
  trajectories that connect each particle's hits in time order. Cherenkov and
  PID collections are shown as hits but left out of the trajectories: their
  photon hits are attributed to the charged particle that emitted them and
  would draw zigzags across the photosensors.
- **MC particles** (both models) — every particle of the `MCParticles`
  collection becomes a straight line from its vertex to its endpoint, with
  points on a fixed time grid so the time animation reveals each line at the
  particle's real speed (computed from its momentum and mass). Nothing is
  filtered: the line count equals the collection size, and the trajectory id
  equals the MCParticle index. The piece converts by default but starts
  **hidden** — open the left panel (Physics tree) and press the eye on the
  `MCParticles` row to show it. A deep link can show it too:
  `config.painters.byPiece.MCParticles.visible=true`.

For pieces with tens of thousands of trajectories (background frames), select
the batched painter in the right-pane painter panel — or with
`config.painters.byPiece.MCParticles=trajectory-lines-batched` — which draws
the whole piece in two draw calls instead of one object per trajectory. All
tracks then share one line width and dash pattern; coloring, time animation,
and click selection work as usual.

## Limits

- One file at a time; opening another replaces it.
- A remote file needs a server that answers Range requests and allows
  cross-origin reads. Without that, use a `root://` URL through pyrobird, or
  convert ahead of time with `pyrobird convert` (see [Pyrobird](/pyrobird)).
