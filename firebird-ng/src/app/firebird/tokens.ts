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
 *
 * The generic tokens (COMMAND_HANDLERS, CONFIG_DEFAULTS, URL_ALIASES,
 * URL_SHORTHANDS) come from `@dexvis/app-features`; `@dexvis/firebird-ng`
 * re-exports them.
 *
 * Token descriptions exist in development builds only (the Angular idiom):
 * this file is in the initial bundle, and production builds define
 * `ngDevMode` as false and drop the strings.
 */

import { InjectionToken, Type } from '@angular/core';
import type {
  EventPieceFactory,
  PiecePainterConstructor,
  GeometryDataLoader,
  EventDataLoader,
  DataCatalog,
} from '@dexvis/firebird-core';
import type { ThreeExtension, LazyThreeExtensionLoader } from './three-extension';

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

/**
 * One tab of the data selector (the "open data" control shown in the display
 * toolbar panel and on the config page). The component loads lazily so tab UI
 * code (Material, forms) stays out of the initial bundle. Tabs sort by
 * `order`, then registration order.
 */
export interface DataSelectorTabRegistration {
  /** Stable id, e.g. 'presets', 'physics', 'manual'. */
  id: string;
  /** Tab caption. */
  label: string;
  /** Sort key; built-ins use 10, 20, 30. */
  order?: number;
  /** Resolves the tab component. It reads and writes `DataSelectionService.draft`. */
  load: () => Promise<Type<unknown>>;
  /**
   * When false, the tab is offered even with an empty catalog. Default true:
   * a tab that only lists catalog content hides itself when there is none.
   */
  needsCatalog?: boolean;
}

/** Event piece factories (DEX type string -> model object decoder). */
export const EVENT_PIECE_FACTORIES = new InjectionToken<EventPieceFactory[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.event-piece-factories' : '');

/** Painter registrations consumed by EventDisplayService's DataModelPainter. */
export const PAINTERS = new InjectionToken<PainterRegistration[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.painters' : '');

/** Rendering-machinery extensions, instantiated eagerly through DI. */
export const THREE_EXTENSIONS = new InjectionToken<ThreeExtension[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.three-extensions' : '');

/** Lazily-loaded extensions: resolved after init, off the critical path. */
export const LAZY_THREE_EXTENSIONS = new InjectionToken<LazyThreeExtensionLoader[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.lazy-three-extensions' : '');

/** Geometry format/scheme loaders. First `canLoad()` taker wins. */
export const GEOMETRY_LOADERS = new InjectionToken<GeometryDataLoader[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.geometry-loaders' : '');

/** Event data format loaders. First `canLoad()` taker wins. */
export const EVENT_LOADERS = new InjectionToken<EventDataLoader[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.event-loaders' : '');

/** Data catalogs: datasets an installation offers (presets, tags, URL lists). Merged in order. */
export const DATA_CATALOGS = new InjectionToken<DataCatalog[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.data-catalogs' : '');

/** Tabs of the data selector control. */
export const DATA_SELECTOR_TABS = new InjectionToken<DataSelectorTabRegistration[]>(
  typeof ngDevMode !== 'undefined' && ngDevMode ? 'firebird.data-selector-tabs' : '');
