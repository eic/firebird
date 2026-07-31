# Deep Links and URL Parameters

Firebird reads URL query parameters at startup, so a single link can open data,
select an event, change settings, and position the camera. Use deep links to
share a specific view with a colleague, embed a preconfigured display in a web
page, or drive batch screenshots.

All parameters attach to the display route:

```
https://seeeic.org/display?dex=<url>&event=2
http://localhost:5454/display?dex=mydata.firebird.zip&event=0
```

## Parameter cheat sheet

| Parameter        | Example                                    | Action                                                                 |
|------------------|--------------------------------------------|------------------------------------------------------------------------|
| `dex=<url>`      | `dex=https://host/events.firebird.zip`     | Load event data. Accepts DEX `.firebird.json` / `.zip`, or `.root` files (converted server-side when a pyrobird backend is available). |
| `geometry=<url>` | `geometry=epic://epic_craterlake.root`     | Load detector geometry instead of the configured default.              |
| `event=<N>`      | `event=2`                                  | Select event number `N` (0-based) after the data loads.                |
| `config.<key>=<value>` | `config.geometry.themeName=cad`      | Override a setting for this browser session only (see below).          |
| `cmd=<list>`     | `cmd=camera-preset:farforward`             | Run commands, `type:arg` items separated by `;` (see [Command Bus](/command-bus)). |

Notes:

- File URLs can be absolute (`https://...`, `epic://...`) or relative. Relative
  paths resolve through the pyrobird server's download endpoint, so
  `dex=subdir/events.firebird.zip` opens a file under the server's
  `--work-path`. `local://subdir/events.firebird.zip` is the same thing
  spelled explicitly.
- Encode special characters in values: `#` in a color becomes `%23`, so
  `config.examples.cherenkov.ringColor=%23ff4d00`.

## Session-scoped settings: `config.<key>=`

Any setting registered in Firebird can be set from the URL by prefixing its key
with `config.`. URL values win over the server configuration and over values
saved in the browser — but only for the current session. They are never written
to browser storage, so opening someone's link does not change your saved
preferences. Changing the same setting in the UI afterward takes effect
immediately and is saved as usual.

The full priority order, lowest to highest:

```
code defaults < server config.jsonc < saved browser settings < URL config.* < changes made in the running app
```

Examples of useful keys:

```
config.geometry.themeName=cad            # geometry color theme: cool2, cool2no, cad, grey
config.geometry.FastDefaultMaterial=true # fast opaque materials (faster on weak GPUs)
config.events.rootEventRange=0-5         # which entries to convert from .root event files
```

## Commands: `cmd=`

For actions that are not settings — moving the camera, opening several things
in order — use commands. The grammar is `type:argument`, joined by `;`:

```
/display?dex=events.firebird.zip&cmd=show-event:3;camera-preset:farforward
```

The shorthands `dex=`, `geometry=` and `event=` are convenience forms of the
`open-dex`, `open-geometry` and `show-event` commands. The command reference
and how commands execute is described in [Command Bus](/command-bus).

## Worked examples

Open a shared file and jump to event 2:

```
https://seeeic.org/display?dex=https://seeeic.org/d/py8dis-nc_10x100_minq2-1000_minp-250mev_nevt-5_s.firebird.zip&event=2
```

Open the bundled example data with a different geometry and a far-forward
camera:

```
/display?dex=asset://data/example-cherenkov.firebird.json&geometry=epic://epic_ip6.root&cmd=camera-preset:farforward
```

Recolor the example extension's rings for this session:

```
/display?dex=asset://data/example-cherenkov.firebird.json&event=2&config.examples.cherenkov.ringColor=%23ff4d00
```

## Deep links in batch mode

`pyrobird screenshot --url "<deep link>"` captures any of the URLs above
headlessly. The capture waits until the display reports that geometry and
events finished loading and all commands ran. See
[Batch Screenshots](/pyrobird#batch-screenshots).
