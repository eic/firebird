/**
 * This class is responsible in rendering Event or Frame data.
 * It first takes event pieces and manipulates three.js Scene
 * Then responsible for correct rendering at a given time
 */

import { Event } from "../model/event";
import { EventPiece } from "../model/event-piece";
import { Object3D, Group } from "three";
import {
  EventPiecePainter,
  PainterConfigView,
  PiecePainterConstructor,
} from "./event-piece-painter";

export enum DisplayMode
{
  Timed = "timed",
  Timeless = "timeless"
}

/**
 * The painter registry starts EMPTY. Register painters explicitly:
 * - Workers/scripts (no DI): call `registerDefaultPainters(painter)` from
 *   ./default-painters, then `registerPainter()` for custom types.
 * - The Angular app contributes painters through the `PAINTERS` DI token
 *   (see firebird-ng `provideFirebird()` / `withPainter()`).
 *
 * Several painters may register for one piece type. Which one paints a piece
 * is decided per piece by `painterSelector` (the app binds it to the config
 * key `painters.byPiece.<pieceName>`); without a selector the first
 * registered painter wins.
 */
export class DataModelPainter {
  private threeParentNode: Object3D | null = null;
  private entry: Event | null = null;
  private painters: EventPiecePainter[] = [];

  /** Registered painter classes per piece type, in registration order. */
  piecePainterRegistry: { [type: string]: PiecePainterConstructor[] } = {};

  /**
   * Optional hook choosing which registered painter paints a piece.
   * Return undefined to fall back to the first registered painter.
   * The Angular layer binds this to the painter-selection config keys;
   * workers/scripts may leave it unset.
   */
  painterSelector:
    | ((piece: EventPiece, candidates: readonly PiecePainterConstructor[]) => PiecePainterConstructor | undefined)
    | null = null;

  /**
   * Optional hook supplying the resolved config view for a painter instance.
   * The Angular layer binds this to ConfigService-declared keys; without it
   * painters run on their declared defaults.
   */
  configViewProvider:
    | ((piece: EventPiece, painterClass: PiecePainterConstructor) => PainterConfigView | undefined)
    | null = null;

  public setThreeSceneParent(parentNode: Object3D) {
    this.threeParentNode = parentNode;
  }

  public cleanupCurrentEntry() {
    for (let painter of this.painters) {
      painter.dispose();
    }
    this.painters = [];
  }

  public getEntry(): Event|null {
    return this.entry;
  }

  /** The painter drawing the piece with this name in the current entry, or null. */
  public painterFor(pieceName: string): EventPiecePainter | null {
    return this.painters.find(painter => painter.pieceName === pieceName) ?? null;
  }

  /** The painters of the current entry (one per painted piece). */
  public getPainters(): readonly EventPiecePainter[] {
    return this.painters;
  }

  /** The painter classes registered for a piece type, in registration order. */
  public paintersForType(pieceType: string): readonly PiecePainterConstructor[] {
    return this.piecePainterRegistry[pieceType] ?? [];
  }

  public setEntry(entry: Event): void {
    this.cleanupCurrentEntry();
    this.entry = entry;

    if (!this.threeParentNode) {
      throw new Error('Three.js parent node is not set.');
    }

    for (const piece of entry.pieces) {
      const candidates = this.piecePainterRegistry[piece.type] ?? [];
      if (candidates.length === 0) {
        console.warn(`No piece painter registered for piece type: ${piece.type}`);
        continue;
      }
      const PainterClass = this.painterSelector?.(piece, candidates) ?? candidates[0];

      let pieceNode = new Group();
      pieceNode.name = piece.name;
      pieceNode.userData['piece'] = piece;
      this.threeParentNode.add(pieceNode);

      const configView = this.configViewProvider?.(piece, PainterClass);
      const painter = new PainterClass(pieceNode, piece, configView);

      this.painters.push(painter);
    }
  }

  /**
   * Registers a custom painter class provided by the user. Registering more
   * classes for the same type adds alternatives (selectable per piece);
   * registering the same class twice is a no-op.
   *
   * @param pieceType - The type of the piece for which the painter should be used.
   * @param painterClass - The user's custom EventPiecePainter subclass.
   */
  public registerPainter(pieceType: string, painterClass: PiecePainterConstructor): void {
    if (!pieceType || !painterClass) {
      throw new Error('Both pieceType and painterClass are required to register a custom painter.');
    }
    const list = this.piecePainterRegistry[pieceType] ??= [];
    if (!list.includes(painterClass)) {
      list.push(painterClass);
    }
  }

  /** paints scene at the current time. null - no-time mode (draws everything) */
  public paint(time: number | null): void {
    for (let painter of this.painters) {
      painter.paint(time);
    }
  }
}
