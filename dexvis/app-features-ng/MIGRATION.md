# Migrating eiceye to @dexvis/app-features

eiceye (`eye-ng`) carries a copy of the machinery this package now holds: it
was copied from Firebird and renamed (`provideEiceye`, `EyeCommand`). This
guide replaces that copy with the package, file for file. Firebird made the
same move; its `firebird-ng/src/app/firebird/firebird-features.ts` is a
working example.

## Before you start

1. Add the dependency. Until the package is published, install the packed
   tarball built from this repository:

   ```bash
   # in this repository
   npm run build
   cd dist/dexvis/app-features && npm pack     # dexvis-app-features-0.1.0.tgz
   # in eye-ng
   npm install /path/to/dexvis-app-features-0.1.0.tgz
   ```

   After the release, use `npm install @dexvis/app-features`. The package
   brings `jsonc-parser` with it, so eye-ng can drop its own `jsonc-parser`
   dependency if nothing else imports it.
2. Confirm the peer versions: Angular 22.1 or later within major version 22,
   and RxJS 7.8. eye-ng already uses them.

## File-for-file mapping

Paths are relative to `eye-ng/src/app/`.

| eiceye file | Replacement | Action |
|---|---|---|
| `eiceye/command-bus.service.ts` | `CommandBusService`, `CommandHandler`, `AppCommand` | Delete the file. Replace `EyeCommand` with `AppCommand`, or keep the name with `export type EyeCommand = AppCommand;` in `eiceye/index.ts`. |
| `eiceye/tokens.ts` | `COMMAND_HANDLERS`, `URL_ALIASES`, `CONFIG_DEFAULTS`, `UrlAlias` | Delete the file. Declare new eiceye extension points (for example a file decoder token) in a new `tokens.ts` with `contributeValue()` / `contributeClass()` helpers. |
| `eiceye/eiceye-features.ts` | `AppFeature`, `appFeatures()`, `provideAppFeatures()`, `withConfigDefaults()`, `withCommandHandler()`, `withUrlAlias()`, `withUrlShorthand()`, `withServerConfig()` | Keep the file with `provideEiceye()` only; see [provideEiceye](#provideeiceye). |
| `eiceye/url-startup.service.ts` | `UrlStartupService` plus three `withUrlShorthand()` calls | Delete the file; see [URL shorthands](#url-shorthands). |
| `eiceye/index.ts` | | Re-export what eiceye code imports from `./eiceye` today, now from `@dexvis/app-features`. |
| `services/config.service.ts` | `ConfigService`, `ConfigSchema`, `ConfigSnapshot` | Delete the file. Same class; the API gains methods, and resets and repeated declarations behave differently (see [Behavior differences](#behavior-differences)). |
| `utils/config-property.ts` | `ConfigProperty`, `ConfigPropertyMeta`, `coerceConfigValue` | Delete the file. Same class; the API gains methods, and `setDefault()` behaves differently (see [Behavior differences](#behavior-differences)). |
| `utils/deep-copy.ts` | none (internal to the package) | Delete the file; only `server-config.service.ts` imports it. |
| `services/server-config.service.ts` | `ServerConfigService<T>`, `ServerConfigBase` | Keep the `ServerConfig` interface and `defaultServerConfig`; delete the class; see [Server config](#server-config). |
| `services/config-precedence.spec.ts` | the package suite (`config-precedence.spec.ts`, `features.spec.ts`) | Delete the file. The package covers the same precedence chain, and its `features.spec.ts` checks it end to end through `provideAppFeatures()`. |

Then replace the imports in the files that use the machinery:

| File | Change |
|---|---|
| `app.config.ts` | Keep `import { provideEiceye } from './eiceye';`. |
| `pages/file/file.component.ts` | `ConfigService` from `@dexvis/app-features`. |
| `services/catalog.service.ts`, `services/event-data.service.ts`, `services/files.service.ts` | `inject<ServerConfigService<ServerConfig>>(ServerConfigService)`, with `ServerConfigService` from `@dexvis/app-features` and `ServerConfig` from `./server-config.service`. |

## provideEiceye

`provideEiceye()` becomes a thin wrapper that adds eiceye's server config
defaults and URL shorthands to whatever features the app passes:

```ts
import { EnvironmentProviders } from '@angular/core';
import {
  AppFeature,
  AppFeatureInput,
  appFeatures,
  provideAppFeatures,
  withServerConfig,
  withUrlShorthand,
} from '@dexvis/app-features';
import { defaultServerConfig } from '../services/server-config.service';

export type EiceyeFeature = AppFeature;
export const eiceyeFeatures: (...features: AppFeatureInput[]) => EiceyeFeature = appFeatures;

export function provideEiceye(...features: AppFeatureInput[]): EnvironmentProviders {
  return provideAppFeatures(
    withServerConfig({ defaults: defaultServerConfig }),
    withUrlShorthand('did', 'open-did'),
    withUrlShorthand('file', 'open-file'),
    withUrlShorthand('event', 'show-event'),
    ...features,
  );
}
```

`withConfigDefaults`, `withCommandHandler` and `withUrlAlias` keep their names
and signatures; import them from the package (or re-export them from
`eiceye/index.ts`).

## URL shorthands

eiceye's `url-startup.service.ts` built the shorthand commands inline:
`?did=` became `{ type: 'open-did', did }`, `?file=` became
`{ type: 'open-file', url }`, and `?event=` became
`{ type: 'show-event', index }`. In the package, a shorthand stands for its
`?cmd=` form: `?did=X` queues exactly what `?cmd=open-did:X` queues, and the
command handler's `fromUrlArg()` builds the command.

Each handler for these types must implement `fromUrlArg()` and return the
shape the inline code produced:

```ts
fromUrlArg(arg: string): AppCommand {
  return { type: 'open-did', did: arg };            // open-did
  // return { type: 'open-file', url: arg };        // open-file
  // return { type: 'show-event', index: parseInt(arg, 10) };  // show-event
}
```

A type without a handler, or a handler without `fromUrlArg()`, gets
`{ type, value: arg }` instead. Today eiceye registers no command handlers
and no page calls `runStartupCommands()`, so the queued commands never run
and nothing observable changes. Add the handlers with `fromUrlArg()` when the
pages start to consume startup commands.

One difference works in eiceye's favor: a shorthand value may contain `;`
(only the `?cmd=` list splits on it).

## Server config

Keep eiceye's shape and defaults, and let the package load the file:

```ts
import type { ServerConfigBase } from '@dexvis/app-features';

export interface ServerConfig extends ServerConfigBase {
  servedByEiceye: boolean;
  apiAvailable: boolean;
  apiBaseUrl: string;
  logLevel: string;
}

export const defaultServerConfig: ServerConfig = {
  servedByEiceye: false,
  apiAvailable: false,
  apiBaseUrl: '',
  logLevel: 'info',
};
```

`userConfigs` and `startupCommands` come from `ServerConfigBase`; remove
them from eiceye's interface. Inject the service with the type wherever the
code reads eiceye fields:

```ts
private serverConfig = inject<ServerConfigService<ServerConfig>>(ServerConfigService);
```

The loader also accepts the `configs: [{ key, value }]` shape that Firebird's
backend writes; eiceye's server can keep writing `userConfigs`.

## Behavior differences

- The token description strings change from `eiceye.*` to
  `app-features.*`, and production builds drop them. Nothing reads them at
  runtime.
- `AppCommand.source` also allows `'batch'`.
- The server config load logs `[ServerConfigService] Server config loaded`
  and the number of `configs` entries.
- `CommandBusService` gains `commandFromUrlArg(type, arg, source)`, which
  `parseCommandString()` and the shorthands share.
- `ConfigProperty.setDefault()` (and `ConfigService.loadDefaults()` /
  `loadDefaultsFor()`, which call it) no longer writes the default into
  localStorage. It removes the stored value and its timestamp and ends any
  URL override, so the value falls back to the server value or the default.
  `clearStored()` removes only the stored value. A reset button that relied
  on the old behavior keeps working; a server value it used to hide now
  shows.
- A repeated declaration of a key with a different default, or with a
  validator the first declaration lacked, logs a `[ConfigService]` warning in
  development builds. The first declaration still wins. Keep one schema
  object per key and import it wherever the key is declared.
- `ConfigService` gains `getConfigOrPlaceholder()` and `isDeclared()`,
  `ConfigProperty` gains `clearStored()`, `redeclare()`, `codeDefault`,
  `defaultValue` and `validator`. The package adds `isPersistableUrl`,
  `withConfigStorage()` and `buildDeepLink()`.
- A storage prefix (`withConfigStorage({ prefix })`) is optional; without
  it keys are stored as before. Adding one moves every saved setting: values
  saved without the prefix are no longer read.

## Verify

1. `npm run test:headless`: the eiceye suites that remain still pass.
2. `npm run build`: compare the initial bundle with the build before the
   migration. The package replaces code of the same size.
3. Open `/?config.<key>=<value>` for a declared key and confirm the value
   applies without being written to localStorage.
