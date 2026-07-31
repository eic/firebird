# Command Bus

Firebird actions that arrive from outside the UI — URL deep links, server
startup configuration, batch scripts — all travel as **commands**: small
serializable objects with a `type` and arguments. One dispatcher executes them;
handlers are registered per command type. This page is for developers who want
to script the display or add their own commands.

For the end-user view of URL parameters, see
[Deep Links](/deep-links).

## Command anatomy

```ts
interface FbCommand {
  type: string;                 // selects the handler, e.g. 'open-dex'
  source?: 'url' | 'server' | 'batch' | 'ui' | 'code';
  [key: string]: unknown;       // handler-specific arguments
}
```

The same command can be written as a URL-grammar string: `type:argument`.
Multiple commands join with `;`. The argument is everything after the FIRST
colon, so URLs with colons survive: `open-dex:https://host/file.zip`.

## Built-in commands

| Type            | Arguments            | URL grammar                    | Action |
|-----------------|----------------------|--------------------------------|--------|
| `open-geometry` | `url`                | `open-geometry:<url>`          | Load detector geometry. The loader is chosen from the registered geometry loaders by file extension / URL scheme. |
| `open-dex`      | `url`                | `open-dex:<url>`               | Load event data. DEX json/zip and `.root` (server conversion) are chosen the same registry-driven way. |
| `show-event`    | `index` (number)     | `show-event:2`                 | Select event by index. Waits up to 30 s for events to finish loading first. |
| `set-config`    | `key`, `value`       | `set-config:key=value`         | Set a configuration value. From `url`/`server`/`batch` sources the value is session-scoped (not persisted); from `ui`/`code` it is saved normally. |
| `camera-preset` | `name`               | `camera-preset:farforward`     | Move the camera to a named preset: `center`, `farforward`. |

The URL shorthands `?dex=`, `?geometry=`, `?event=` expand to `open-dex`,
`open-geometry`, `show-event`.

## Where commands come from

Commands queue at application startup and run once the 3D scene is
initialized, in this order:

1. **Server**: the `startupCommands` array in `config.jsonc` (or injected by
   pyrobird — see below). Entries are command objects or grammar strings.
2. **URL**: the shorthands and `?cmd=...` from the page address.

Server commands queue first, so a URL deep link can follow up on or override
what the server started. Execution is sequential — each command awaits the
previous one, which is why `show-event` after `open-dex` works reliably.
When startup commands carry data-loading commands, the corresponding
config-driven auto-load is skipped (no double loading).

### Server configuration

```jsonc
// config.jsonc
{
  "startupCommands": [
    "open-dex:mydata.firebird.zip;show-event:2",
    { "type": "camera-preset", "name": "farforward" }
  ]
}
```

With pyrobird, pass commands from the CLI instead of editing files:

```bash
pyrobird serve --startup-commands "open-dex:mydata.firebird.zip;show-event:2"
pyrobird screenshot --commands "open-dex:mydata.firebird.zip;show-event:2;camera-preset:farforward"
```

## Readiness flags for batch tools

The display publishes its state to `window.firebird` so headless drivers know
when it is safe to capture:

```js
window.firebird = {
  geometryReady: true,        // geometry finished loading (or none pending)
  startupCommandsDone: true,  // the startup queue ran to completion
  pendingLoads: 0,            // in-flight geometry/event loads
  ready: true,                // all of the above - safe to screenshot
}
```

`pyrobird screenshot` waits for `ready === true` automatically. Custom
Playwright/Puppeteer scripts should do the same:

```js
await page.waitForFunction("window.firebird && window.firebird.ready === true");
```

The object exists only on the display route, after the display page
initializes.

## Adding your own command

A command handler is a class registered through the extension system (see
[Extension System](/extensions)):

```ts
import { Injectable } from '@angular/core';
import { CommandHandler, FbCommand } from '@firebird/ng';

@Injectable()
export class FocusDetectorCommandHandler implements CommandHandler {
  readonly type = 'focus-detector';

  // optional: how '?cmd=focus-detector:DIRC' maps to the command object
  fromUrlArg(arg: string): FbCommand {
    return { type: this.type, detectorName: arg };
  }

  async execute(command: FbCommand): Promise<void> {
    const name = command['detectorName'] as string;
    // ... find the detector node, move the camera
  }
}
```

```ts
// app.config.ts
provideFirebird(
  withFirebirdBuiltins(),
  withCommandHandler(FocusDetectorCommandHandler),
)
```

The handler class is instantiated through dependency injection, so `inject()`
works in it. One handler per type; registering an existing type replaces the
built-in — that is allowed and deliberate. After registration the command
works from every source: `?cmd=focus-detector:DIRC` in a link,
`startupCommands` on a server, `--commands` in batch.

Not implemented on purpose (yet): undo/rewind and command journaling. The
`source` field exists so a journal can be added later without changing
dispatch call sites.
