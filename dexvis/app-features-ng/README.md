# @dexvis/app-features

App composition machinery for Angular applications that grow through feature
packs. An application assembles itself from `with*()` features; the package
supplies the plumbing those features ride on:

- **Feature composition**: `provideAppFeatures()`, `appFeatures()`,
  `contributeValue()`, `contributeClass()`. Features are DI multi-providers;
  nothing registers itself through import side effects.
- **Layered config**: `ConfigService` and `ConfigProperty`, with the source
  precedence *defaults < server < localStorage < URL < runtime*. URL values
  last for the session and are never persisted.
- **Server config**: `ServerConfigService` loads `assets/config.jsonc` (JSON
  with comments) at startup and feeds its values into the server layer.
- **Command bus**: `CommandBusService` dispatches serializable commands to
  handlers that features contribute.
- **URL startup**: `UrlStartupService` turns `?config.<key>=<value>`,
  application-defined shorthands, and `?cmd=type:arg;type:arg` into session
  config values and queued startup commands.

The package is generic: it holds the mechanism, and each application keeps
its own extension points, command handlers and URL shorthands. It grew out of
the [Firebird](https://github.com/eic/firebird) event display and is shared
with the eiceye campaign browser.

## Install

```bash
npm install @dexvis/app-features
```

Peer dependencies: `@angular/core` and `@angular/common` 22.1 or later within
major version 22, and `rxjs` 7.8. The server config loader uses `HttpClient`,
so the application must call `provideHttpClient()`.

## Quick start

Assemble the application in `app.config.ts`:

```ts
import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  provideAppFeatures,
  withCommandHandler,
  withConfigDefaults,
  withServerConfig,
  withUrlShorthand,
} from '@dexvis/app-features';
import { OpenFileCommandHandler } from './open-file.command';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()),
    provideAppFeatures(
      withServerConfig({ defaults: { apiBaseUrl: '' } }),
      withConfigDefaults({ 'viewer.theme': 'dark' }),
      withCommandHandler(OpenFileCommandHandler),
      withUrlShorthand('file', 'open-file'),   // ?file=<url> = ?cmd=open-file:<url>
    ),
  ],
};
```

Write the command handler. `fromUrlArg()` turns the URL argument into the
command; `execute()` performs it:

```ts
import { Injectable } from '@angular/core';
import { AppCommand, CommandHandler } from '@dexvis/app-features';

@Injectable()
export class OpenFileCommandHandler implements CommandHandler {
  readonly type = 'open-file';
  readonly opened: string[] = [];

  fromUrlArg(arg: string): AppCommand {
    return { type: this.type, url: arg };
  }

  execute(command: AppCommand): void {
    this.opened.push(String(command['url']));
  }
}
```

Startup commands are queued, not run. Run them from the page that hosts their
effects, once that page is ready:

```ts
import { Component, OnInit, inject } from '@angular/core';
import { CommandBusService } from '@dexvis/app-features';

@Component({ selector: 'app-viewer', template: '' })
export class ViewerComponent implements OnInit {
  private readonly commandBus = inject(CommandBusService);

  ngOnInit(): void {
    void this.commandBus.runStartupCommands();
  }
}
```

With this setup, `https://host/viewer?file=https://host/run1.root` opens the
file once the viewer page initializes.

## Features and feature packs

A feature is an object with a `providers` array: one `with*()` call
contributes one thing. Compose features into a pack with `appFeatures()`,
which flattens arrays and skips falsy entries, so a pack can include
features conditionally:

```ts
import { AppFeature, appFeatures, withCommandHandler, withConfigDefaults, withUrlShorthand } from '@dexvis/app-features';

export function withFilePack(options: { verbose?: boolean } = {}): AppFeature {
  return appFeatures(
    withCommandHandler(OpenFileCommandHandler),
    withUrlShorthand('file', 'open-file'),
    options.verbose && withConfigDefaults({ 'log.level': 'debug' }),
  );
}
```

Declare the application's own extension points the same way: a
multi-provider `InjectionToken` plus a `with*()` function that contributes to
it with `contributeValue()` or `contributeClass()`. A class contributed with
`contributeClass()` is instantiated through DI and may call `inject()`.

```ts
import { InjectionToken, Type } from '@angular/core';
import { AppFeature, contributeClass } from '@dexvis/app-features';

export interface Exporter {
  readonly format: string;
  export(data: unknown): string;
}

export const EXPORTERS = new InjectionToken<Exporter[]>('my-app.exporters');

export function withExporter(exporter: Type<Exporter>): AppFeature {
  return contributeClass(EXPORTERS, exporter);
}
```

Read the contributions with `inject(EXPORTERS, { optional: true }) ?? []`.

## Layered config

Each config key has exactly one `ConfigProperty`. Its value comes from the
highest-precedence source that has one:

| Precedence | Source | How it is set | Persisted |
|---|---|---|---|
| 1 (lowest) | Code default | `ConfigService.declare({ key, default })` | No |
| 2 | Feature default | `withConfigDefaults({ key: value })` (replaces the code default) | No |
| 3 | Server | `configs` or `userConfigs` in `config.jsonc` | No |
| 4 | localStorage | A runtime write in an earlier session | Yes |
| 5 | URL | `?config.<key>=<value>` | No, session only |
| 6 (highest) | Runtime | `property.value = x` or `setValue(x)` | Yes, and it ends the URL override |

Declare a key and read or write it:

```ts
import { inject } from '@angular/core';
import { ConfigService } from '@dexvis/app-features';

const theme = inject(ConfigService).declare({
  key: 'viewer.theme',
  default: 'dark',
  label: 'Theme',
  options: ['dark', 'light'],
});
theme.valueSignal();   // reactive read
theme.value = 'light'; // runtime write: persists to localStorage
```

Keep these rules in mind:

- Use the instance that `declare()` or `addConfig()` returns. Both return the
  existing property when the key is already registered.
- Values for keys that nobody has declared yet wait. A server or URL value
  that arrives before the code that declares the key still applies at
  declaration time.
- Declare each key once, from one schema object that every reader and
  writer imports. The first declaration decides the default and the
  validator. In development builds, a later declaration with a different
  default, or with a validator the first one lacks, logs a
  `[ConfigService]` warning; the first declaration stays in effect.
- To write a key whose owner may not have declared it yet (a `set-config`
  command, for example), use `getConfigOrPlaceholder(key, value)`. The first
  real declaration replaces the placeholder's default and validator and
  re-reads the stored, server and URL values with the declared type.
- URL and server values arrive as strings or JSON values and are coerced to
  the type of the default (`'7'` becomes `7` for a numeric key).
- Don't declare a key inside `computed()` or during template evaluation: the
  first declaration applies the waiting values, which writes signals.
- `valueSignal` (Angular signal) and `changes$` (RxJS) both emit the
  effective value.

### Validators

A validator applies to every source of a key: code, server, stored and URL
values, and runtime writes. A stored value that fails is ignored, so a
validator also cleans up values that an older build saved. Give URL-valued
keys `isPersistableUrl`, which rejects `blob:` and `data:` URLs:

```ts
import { ConfigService, isPersistableUrl } from '@dexvis/app-features';

const fileUrl = inject(ConfigService).declare({
  key: 'viewer.fileUrl',
  default: '',
  validator: isPersistableUrl,
});
```

### Reset and stored values

| Call | Effect |
|---|---|
| `property.setDefault()` | Removes the stored value and ends the URL override. The value falls back to the server value or the default; nothing is written, so a later server or feature default still applies. |
| `property.clearStored()` | Removes only the stored value; a URL override stays. |
| `configService.loadDefaults()`, `loadDefaultsFor(prefix)` | `setDefault()` for every key, or for the keys that start with `prefix`. |

Both remove the value and its `<key>.time` timestamp through the storage's
`removeItem()`. A custom `PersistentPropertyStorage` without `removeItem()`
cannot remove values: `clearStored()` then warns and changes nothing, and
`setDefault()` writes the fallback value instead.

### Storage prefix

Applications that share an origin can keep separate settings:

```ts
provideAppFeatures(
  withConfigStorage({ prefix: 'eiceye.' }),   // 'viewer.theme' is stored as 'eiceye.viewer.theme'
);
```

The prefix applies to every property the `ConfigService` creates
(`declare()`, `getConfigOrCreate()`, `createConfig()`,
`getConfigOrPlaceholder()`). A property you construct yourself and pass to
`addConfig()` keeps the storage you gave its constructor.

## Server config

`provideAppFeatures()` loads `assets/config.jsonc` once, at startup. A backend
that serves the application can rewrite the file on the fly; a static
deployment serves the built file as is. When the file is missing or invalid,
the defaults stay in effect.

The package reads three fields; the application adds its own:

```jsonc
{
  // Values for the SERVER config layer, in either shape
  "userConfigs": { "viewer.theme": "light" },
  "configs": [{ "key": "viewer.maxItems", "value": 50 }],
  // Commands queued before URL commands: 'type:arg' strings or command objects
  "startupCommands": ["open-file:https://host/data/run1.root", { "type": "show-event", "index": 3 }],
  // An application field
  "apiBaseUrl": "http://localhost:8000"
}
```

Describe the application's fields by extending `ServerConfigBase`, pass the
defaults through `withServerConfig()`, and inject the service with the type:

```ts
import { inject } from '@angular/core';
import { ServerConfigBase, ServerConfigService } from '@dexvis/app-features';

export interface MyServerConfig extends ServerConfigBase {
  apiBaseUrl: string;
}

const serverConfig = inject<ServerConfigService<MyServerConfig>>(ServerConfigService);
const apiBaseUrl = serverConfig.configSignal().apiBaseUrl;
```

`configSignal` is replaced when the load completes, so bind to the signal
instead of keeping a reference to the object. `withServerConfig({ url })`
fetches the file from another location.

## Commands and URL startup

A command is a plain object: `type` selects the handler, the other fields are
its arguments, and `source` records where it came from (`'url'`, `'server'`,
`'batch'`, `'ui'` or `'code'`). Dispatch one from code:

```ts
await inject(CommandBusService).dispatch({ type: 'open-file', url: 'a.root', source: 'ui' });
```

The URL grammar that `UrlStartupService` applies at startup:

| Parameter | Effect |
|---|---|
| `?config.<key>=<value>` | Sets the URL layer of `<key>` for this session. |
| `?<shorthand>=<value>` | Queues the same command as `?cmd=<type>:<value>` for each shorthand registered with `withUrlShorthand(shorthand, type)`. The value may contain `;`. |
| `?cmd=<type>:<arg>;<type>` | Queues one command per `;`-separated item. The first `:` separates the type from the argument, so arguments can be URLs. |

For a type with a handler that implements `fromUrlArg()`, the handler builds
the command from the argument. Otherwise the argument lands as
`{ type, value: arg }`. A command type without any handler still queues;
dispatching it fails with an error that lists the known types.

### Encode values

The browser decodes the query before the parser sees it, so every value must
be percent-encoded: an unencoded `&` ends the value, `+` becomes a space,
and `#` ends the query. A presigned download URL carries its own query
string and always needs encoding. `buildDeepLink()` builds links in this
grammar with every value encoded:

```ts
import { buildDeepLink } from '@dexvis/app-features';

const link = buildDeepLink('https://host/viewer', {
  params: { file: 'https://bucket.example/run1.root?X-Amz-Signature=a+b&X-Amz-Expires=600' },
  config: { 'viewer.theme': 'light' },
  commands: ['camera-preset:top', { type: 'show-event', arg: 3 }],
});
// https://host/viewer?file=https://bucket.example/run1.root%3FX-Amz-Signature%3Da%2Bb%26X-Amz-Expires%3D600
//   &config.viewer.theme=light&cmd=camera-preset:top;show-event:3
```

`:` and `/` stay literal so embedded URLs remain readable. The `?cmd=` list
splits on `;` after decoding, so no encoding lets a command argument contain
`;`; `buildDeepLink()` throws for one. Pass such a value through a shorthand
in `params`, which takes the whole value.

Queue order: server `startupCommands` first, then shorthands in registration
order, then the `?cmd=` list. `runStartupCommands()` runs the queue in order,
logs and skips a failing command, and then sets the `startupCommandsDone`
signal. It resolves to the failures (`{ command, message }`); pass
`{ onFailure }` to receive each one as it happens, before
`startupCommandsDone` turns true, for example to show it to the user.

## Startup sequence

`provideAppFeatures()` adds one app initializer that runs after the
initializers your features contribute:

1. Apply the `withConfigDefaults()` values, in feature order.
2. Load the server config and feed its values into the server layer.
3. Parse the page URL: session config values, then startup commands.

In your own app initializers, call every `inject()` before the first `await`.
The injection context does not survive an `await` (error NG0203).

## API summary

| Export | Kind | Purpose |
|---|---|---|
| `provideAppFeatures(...features)` | Function | Assembles the application and adds the startup initializer. |
| `appFeatures(...features)` | Function | Composes features into a pack. |
| `contributeValue(token, value)` / `contributeClass(token, cls)` | Function | Contribute to a multi-provider token. |
| `withConfigDefaults`, `withCommandHandler`, `withUrlAlias`, `withUrlShorthand`, `withServerConfig`, `withConfigStorage` | Function | Built-in features. |
| `AppFeature`, `AppFeatureInput` | Type | The feature shape and what composition accepts. |
| `CONFIG_DEFAULTS`, `COMMAND_HANDLERS`, `URL_ALIASES`, `URL_SHORTHANDS`, `SERVER_CONFIG_OPTIONS`, `CONFIG_STORAGE_OPTIONS` | Token | The tokens behind the built-in features. |
| `ConfigService`, `ConfigProperty`, `ConfigSchema`, `coerceConfigValue` | Class, type, function | Layered config. |
| `PersistentPropertyStorage`, `LocalStoragePropertyStorage`, `ConfigStorageOptions` | Type, class, type | Where the localStorage layer persists. |
| `isPersistableUrl` | Function | Validator for URL-valued keys. |
| `ServerConfigService`, `ServerConfigBase`, `DEFAULT_SERVER_CONFIG_URL` | Class, type, constant | Server config loading. |
| `CommandBusService`, `AppCommand`, `CommandHandler` | Class, types | Command bus. |
| `UrlStartupService`, `CONFIG_PARAM_PREFIX` | Class, constant | URL startup parsing. |
| `buildDeepLink`, `DeepLinkOptions`, `DeepLinkCommand`, `DeepLinkValue` | Function, types | Builds links in the URL grammar, every value encoded. |

`URL_ALIASES` collects protocol aliases (`withUrlAlias('data://',
'https://host/data/')`); the application's own URL resolution applies them.

## Develop

```
projects/
└── app-features/          library, published as @dexvis/app-features
    ├── src/public-api.ts  entry point
    ├── src/lib/           sources and *.spec.ts
    └── vitest.config.mts  specs run under Angular's JIT compiler in jsdom
```

In this repository:

```bash
npm install
npm test               # vitest
npm run build          # ng-packagr -> dist/dexvis/app-features
cd dist/dexvis/app-features && npm pack --dry-run
```

Inside the Firebird monorepo, where the package is an npm workspace member,
run the same steps from the monorepo root:

```bash
npm test -w @dexvis/app-features
npm run build -w @dexvis/app-features
```

Publish from the built directory: `cd dist/dexvis/app-features && npm publish`.

## License

MIT
