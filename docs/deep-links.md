# Deep Links and URL Parameters

Firebird reads URL query parameters at startup, so a single link can open data,
select an event, change settings, and position the camera. Use deep links to
share a specific view with a colleague, embed a preconfigured display in a web
page, or drive batch screenshots.

All parameters attach to the display route, and equally to the quad
projection view (`/split-window` — Top/Side/Front cross-sections plus the 3D
view, each with its own geometry cut):

```
https://seeeic.org/display?dex=<url>&event=2
http://localhost:5454/display?dex=mydata.firebird.zip&event=0
https://seeeic.org/split-window?dex=<url>&event=2&config.quadView.front.clipPos=1500
```

Quad-view settings (usable as `config.<key>=` overrides): cut positions
`quadView.top.clipPos`, `quadView.side.clipPos`, `quadView.front.clipPos`
(millimeters), and tracks-over-geometry toggles `quadView.top.tracksOnTop`,
`quadView.side.tracksOnTop`, `quadView.front.tracksOnTop`,
`quadView.main.tracksOnTop`.

## Parameter cheat sheet

| Parameter        | Example                                    | Action                                                                 |
|------------------|--------------------------------------------|------------------------------------------------------------------------|
| `dex=<url>`      | `dex=https://host/events.firebird.zip`     | Load event data. Accepts DEX `.firebird.json` / `.zip`, or `.root` files (converted server-side when a pyrobird backend is available). |
| `geometry=<url>` | `geometry=epic://epic_craterlake.root`     | Load detector geometry instead of the configured default.              |
| `event=<N>`      | `event=2`                                  | Select event number `N` (0-based) after the data loads.                |
| `config.<key>=<value>` | `config.geometry.themeName=cad`      | Override a setting for this browser session only (see below).          |
| `cmd=<list>`     | `cmd=camera-preset:farforward`             | Run commands, `type:arg` items separated by `;` (see [Command Bus](/command-bus)). |

Notes:

- What a link loads stays on screen when you go to **Configure** and back to
  the display: the configured default geometry or events load again only after
  you change that setting or apply a choice in the data selector.
- File URLs can be absolute (`https://...`, `epic://...`) or relative. Relative
  paths resolve through the pyrobird server's download endpoint, so
  `dex=subdir/events.firebird.zip` opens a file under the server's
  `--work-path`. `local://subdir/events.firebird.zip` is the same thing
  spelled explicitly.
- Percent-encode every value that is not a plain word or a plain URL; see
  [Percent-encode values](#percent-encode-values).

## Percent-encode values

The browser decodes the query string before Firebird reads it, so characters
with a meaning in a query string must be percent-encoded inside a value:

| Character | Encoded | What happens without encoding |
|---|---|---|
| `&` | `%26` | Ends the value; the rest becomes another parameter. |
| `+` | `%2B` | Turns into a space. |
| `#` | `%23` | Ends the query; everything after it is dropped. |
| `%` | `%25` | Starts an escape sequence. |
| `=` | `%3D` | Usually survives, but encode it for safety. |
| space | `%20` | Not a valid URL character. |

`:` and `/` may stay as they are, so a plain `https://host/file.zip` value
needs no encoding.

Signed and tokened download URLs always need encoding. A presigned S3 URL
carries its own query string:

```
https://bucket.s3.amazonaws.com/run1.firebird.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F20261005%2Fus-east-1&X-Amz-Signature=3f2a
```

Pasted into `dex=` as is, the first `&` ends the value and Firebird requests
`run1.firebird.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256` without a signature.
Encode the whole URL instead:

```
/display?dex=https%3A%2F%2Fbucket.s3.amazonaws.com%2Frun1.firebird.zip%3FX-Amz-Algorithm%3DAWS4-HMAC-SHA256%26X-Amz-Credential%3DAKIA%252F20261005%252Fus-east-1%26X-Amz-Signature%3D3f2a&event=2
```

Encode values with your language's URL encoder, not by hand:

```js
const link = `/display?dex=${encodeURIComponent(presignedUrl)}&event=2`;
```

```python
from urllib.parse import quote
link = f"/display?dex={quote(presigned_url, safe='')}&event=2"
```

In code that builds links for Firebird, `buildDeepLink()` (exported by
`@dexvis/firebird-ng`) encodes every value and checks the `cmd=` grammar:

```ts
import { buildDeepLink } from '@dexvis/firebird-ng';

const link = buildDeepLink('https://seeeic.org/display', {
  params: { dex: presignedUrl, event: 2 },
  config: { 'geometry.themeName': 'cad' },
  commands: ['camera-preset:farforward'],
});
```

One limit cannot be encoded away: `cmd=` items are split on `;` after the
browser decoded the query, so a command argument cannot contain `;`, not
even as `%3B`. Pass such a value through `dex=` or `geometry=`, which take
the whole value. `buildDeepLink()` rejects a `;` inside a command argument.

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
config.events.rootCollections=tracker_hits,mc_particles  # which collection groups to convert (empty = all)
config.painters.byPiece.MCParticles.visible=true  # show the MC particle lines (hidden by default)
config.catalog.url=https://host/catalog.json      # add a remote data catalog to the data selector
```

## Commands: `cmd=`

For actions that are not settings — moving the camera, opening several things
in order — use commands. The grammar is `type:argument`, joined by `;`:

```
/display?dex=events.firebird.zip&cmd=show-event:3;camera-preset:farforward
```

The shorthands `dex=`, `geometry=` and `event=` are convenience forms of the
`open-dex`, `open-geometry` and `show-event` commands: `dex=X` does what
`cmd=open-dex:X` does. They run before the `cmd=` list, in the order
`geometry`, `dex`, `event`. The command reference and how commands execute
is described in [Command Bus](/command-bus).

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
