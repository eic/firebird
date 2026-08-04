/**
 * The DI tokens of the Firebird extension system.
 *
 * Every extensible surface follows one pattern: contributions are declared in
 * DI as multi-providers (via the `with*()` features in firebird-features.ts),
 * collected by core services, and called through narrow lifecycle interfaces.
 * Nothing registers itself via import side effects.
 *
 * Built-ins are first consumers: Firebird's own factories, painters, loaders
 * and command handlers ride these same tokens (see with-firebird-builtins.ts).
 */

import { InjectionToken } from '@angular/core';
import type {
  EventPieceFactory,
  PiecePainterConstructor,
  GeometryDataLoader,
  EventDataLoader,
} from '@firebird/core';
import type { ThreeExtension, LazyThreeExtensionLoader } from './three-extension';
import type { CommandHandler } from './command-bus.service';

/**
 * One painter registration: which piece type it paints and with what class.
 * Either `painterClass` (eager) or `load` (lazy — keeps heavy painter code
 * out of the initial bundle; resolved before the first event is painted).
 */
export interface PainterRegistration {
  forPieceType: string;
  painterClass?: PiecePainterConstructor;
  load?: () => Promise<PiecePainterConstructor>;
}

/** A protocol alias: `epic://file.root` -> `https://.../file.root`. */
export interface UrlAlias {
  prefix: string;
  base: string;
}

/** Event piece factories (DEX type string -> model object decoder). */
export const EVENT_PIECE_FACTORIES =
  new InjectionToken<EventPieceFactory[]>('firebird.event-piece-factories');

/** Painter registrations consumed by EventDisplayService's DataModelPainter. */
export const PAINTERS =
  new InjectionToken<PainterRegistration[]>('firebird.painters');

/** Rendering-machinery extensions, instantiated eagerly through DI. */
export const THREE_EXTENSIONS =
  new InjectionToken<ThreeExtension[]>('firebird.three-extensions');

/** Lazily-loaded extensions: resolved after init, off the critical path. */
export const LAZY_THREE_EXTENSIONS =
  new InjectionToken<LazyThreeExtensionLoader[]>('firebird.lazy-three-extensions');

/** Geometry format/scheme loaders. First `canLoad()` taker wins. */
export const GEOMETRY_LOADERS =
  new InjectionToken<GeometryDataLoader[]>('firebird.geometry-loaders');

/** Event data format loaders. First `canLoad()` taker wins. */
export const EVENT_LOADERS =
  new InjectionToken<EventDataLoader[]>('firebird.event-loaders');

/** Command handlers for the serializable command bus. */
export const COMMAND_HANDLERS =
  new InjectionToken<CommandHandler[]>('firebird.command-handlers');

/** URL protocol aliases consumed by UrlService. */
export const URL_ALIASES =
  new InjectionToken<UrlAlias[]>('firebird.url-aliases');
