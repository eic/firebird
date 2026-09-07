import { Injectable, inject } from '@angular/core';
import {
  EventPiece,
  PainterConfigView,
  PiecePainterConstructor,
  painterIdOf,
  painterMetaOf,
} from '@firebird/core';
import { ConfigService } from './config.service';
import { ConfigProperty } from '../utils/config-property';

/**
 * Binds painter metadata to the config system.
 *
 * Two kinds of keys, both under normal config precedence (defaults < server
 * < localStorage < URL < runtime), so a yaml file, a deep link, and the
 * painter panel all reach the same knobs:
 *
 * - `painters.byPiece.<pieceName>` — WHICH painter draws the piece, holding
 *   a painter id from the registered candidates (default: first registered).
 * - `painters.byPiece.<pieceName>.<knob>` — the selected painter's knobs,
 *   declared from the painter's `static meta.configs`.
 *
 * Painter instances read the knobs through a `PainterConfigView` — a plain
 * object over the declared properties, so painter code stays worker-safe
 * (`@firebird/core` never sees DI).
 */
@Injectable({
  providedIn: 'root',
})
export class PainterConfigService {
  private config = inject(ConfigService);

  selectionKey(pieceName: string): string {
    return `painters.byPiece.${pieceName}`;
  }

  knobKey(pieceName: string, knob: string): string {
    return `painters.byPiece.${pieceName}.${knob}`;
  }

  visibilityKey(pieceName: string): string {
    return this.knobKey(pieceName, 'visible');
  }

  /**
   * Declares (or returns) the piece visibility property. 'visible' is a
   * RESERVED knob name: it lives under the painter knob namespace so the
   * normal config precedence applies (a pack ships a piece hidden via
   * `withConfigDefaults`, a deep link or the panel overrides), but it is
   * applied to the painter's root node by EventDisplayService, not read by
   * painter code — painter meta must not declare a knob named 'visible'.
   */
  visibilityProperty(pieceName: string): ConfigProperty<boolean> {
    return this.config.declare<boolean>({
      key: this.visibilityKey(pieceName),
      default: true,
      label: 'Visible',
    });
  }

  /**
   * Declares (or returns) the painter-selection property of a piece.
   * The default is the first registered painter's id.
   */
  selectionProperty(pieceName: string, candidates: readonly PiecePainterConstructor[]): ConfigProperty<string> {
    return this.config.declare<string>({
      key: this.selectionKey(pieceName),
      default: candidates.length > 0 ? painterIdOf(candidates[0]) : '',
      label: `Painter`,
      options: candidates.map(painterIdOf),
    });
  }

  /** Resolves a selection property value to one of the candidate classes. */
  resolveSelection(
    pieceName: string,
    candidates: readonly PiecePainterConstructor[],
  ): PiecePainterConstructor | undefined {
    if (candidates.length === 0) return undefined;
    const selectedId = this.selectionProperty(pieceName, candidates).value;
    return candidates.find(candidate => painterIdOf(candidate) === selectedId) ?? candidates[0];
  }

  /** The declared knob properties of a painter applied to a piece. */
  knobProperties(piece: EventPiece, painterClass: PiecePainterConstructor): Map<string, ConfigProperty<unknown>> {
    const properties = new Map<string, ConfigProperty<unknown>>();
    const meta = painterMetaOf(painterClass);
    for (const descriptor of meta?.configs ?? []) {
      properties.set(descriptor.key, this.config.declare<unknown>({
        key: this.knobKey(piece.name, descriptor.key),
        default: descriptor.default,
        label: descriptor.label ?? descriptor.key,
        options: descriptor.options,
        min: descriptor.min,
        max: descriptor.max,
      }));
    }
    return properties;
  }

  /**
   * The resolved config view a painter instance reads its knobs through.
   * Undefined when the painter declares no knobs (defaults view applies).
   */
  buildConfigView(piece: EventPiece, painterClass: PiecePainterConstructor): PainterConfigView | undefined {
    const properties = this.knobProperties(piece, painterClass);
    if (properties.size === 0) return undefined;
    return {
      value: <T>(key: string): T => properties.get(key)?.value as T,
      signal: <T>(key: string) => properties.get(key)!.valueSignal as import('@angular/core').Signal<T>,
    };
  }
}
