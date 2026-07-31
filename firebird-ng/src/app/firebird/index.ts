/**
 * Public API of the Firebird Angular extension system (imported as
 * `@firebird/ng` — see tsconfig paths). Extension packages import ONLY from
 * here and from `@firebird/core`; app-internal paths are not a contract.
 */

export * from './firebird-features';
export * from './tokens';
export * from './three-extension';
// Config registry — the entry point extensions use to declare config keys
export { ConfigService } from '../services/config.service';
export type { ConfigSchema } from '../services/config.service';
export { ConfigProperty, coerceConfigValue } from '../utils/config-property';
export type { ConfigPropertyMeta } from '../utils/config-property';
export { CommandBusService } from './command-bus.service';
export type { FbCommand, CommandHandler } from './command-bus.service';
export { BatchStatusService } from './batch-status.service';
export { withFirebirdBuiltins } from './with-firebird-builtins';
export { DexEventLoader, Edm4eicEventLoader, RootGeometryLoader } from './builtin-loaders';
export {
  OpenDexCommandHandler,
  OpenGeometryCommandHandler,
  ShowEventCommandHandler,
  SetConfigCommandHandler,
  CameraPresetCommandHandler,
} from './builtin-command-handlers';
