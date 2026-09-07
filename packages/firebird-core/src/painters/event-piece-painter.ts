import { Object3D } from "three";
import { Signal, signal } from "@angular/core";
import { EventPiece } from "../model/event-piece";
import {disposeNode} from '@dexvis/threejs-tree-editor';


/** Define the type for the constructor of EventPiecePainter subclasses */
export type PiecePainterConstructor =
  new (node: Object3D, piece: EventPiece, config?: PainterConfigView) => EventPiecePainter;

/**
 * One configurable knob of a painter, declared statically in `PainterMeta`.
 * The declaration drives the auto-rendered painter panel and the config keys
 * the knob is stored under (`painters.byPiece.<pieceName>.<key>`), so a knob
 * is settable from the UI, a URL, a server config file, and batch scripts
 * without painter code knowing any of those sources.
 */
export interface PainterConfigDescriptor {
  key: string;
  default: unknown;
  label?: string;
  /** Enumerated choices; rendered as a picker. */
  options?: readonly unknown[];
  /** Numeric range; rendered as a slider. */
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Static painter self-description: what it paints, how UI names it, and what
 * its knobs are. Declared as `static meta` on painter classes; the painter
 * registry uses `forPieceTypes` and `id` (painter selection is the config key
 * `painters.byPiece.<pieceName>` holding an id from the registered painters).
 */
export interface PainterMeta {
  id: string;
  forPieceTypes: string[];
  label?: string;
  configs?: PainterConfigDescriptor[];
}

/**
 * The resolved configuration a painter instance reads its knobs through.
 * Values arrive resolved across all config sources; the painter neither knows
 * nor cares which source set them. Worker-safe: implementations are plain
 * objects over signals — no DI.
 */
export interface PainterConfigView {
  /** Current value of a declared knob. */
  value<T>(key: string): T;
  /** Signal of a declared knob, for reactive bindings. */
  signal<T>(key: string): Signal<T>;
}

/** The `meta` declaration of a painter class, when it has one. */
export function painterMetaOf(painterClass: PiecePainterConstructor): PainterMeta | undefined {
  return (painterClass as unknown as { meta?: PainterMeta }).meta;
}

/** The registry/config id of a painter class (meta id, class name fallback). */
export function painterIdOf(painterClass: PiecePainterConstructor): string {
  return painterMetaOf(painterClass)?.id ?? painterClass.name;
}

/**
 * A config view holding the declared defaults — what a painter gets in
 * contexts without a config system (workers, scripts, tests).
 */
export function defaultPainterConfigView(meta?: PainterMeta): PainterConfigView {
  const signals = new Map<string, Signal<unknown>>();
  for (const descriptor of meta?.configs ?? []) {
    signals.set(descriptor.key, signal(descriptor.default));
  }
  const emptySignal = signal(undefined);
  return {
    value<T>(key: string): T {
      return (signals.get(key)?.() as T)!;
    },
    signal<T>(key: string): Signal<T> {
      return (signals.get(key) ?? emptySignal) as Signal<T>;
    },
  };
}

/**
 * Identifies one entity inside one piece: the piece name (unique within the
 * event) plus the entity index (entity id ≡ index into the piece columns).
 */
export interface EntityRef {
  pieceName: string;
  entityIndex: number;
}

/**
 * Resolves a scene object (or any descendant of one) back to the entity it
 * was built from, by walking up to the nearest ancestor a painter stamped
 * with `registerEntityObject`. Returns null for objects that do not belong
 * to any painted entity (geometry, helpers).
 *
 * Batched painters draw MANY entities in one object, so a per-object stamp
 * cannot name the entity — they stamp `userData['entityIndexResolver']`, a
 * function mapping the raycast intersection (its picked segment/instance)
 * to the entity index. Pass the intersection through when there is one.
 */
export function entityRefOf(object: Object3D, intersection?: unknown): EntityRef | null {
  for (let node: Object3D | null = object; node; node = node.parent) {
    const pieceName = node.userData?.["pieceName"];
    if (typeof pieceName !== "string") continue;

    const resolver = node.userData?.["entityIndexResolver"];
    if (typeof resolver === "function" && intersection !== undefined) {
      const resolved = resolver(intersection);
      if (typeof resolved === "number") return { pieceName, entityIndex: resolved };
    }
    const entityIndex = node.userData?.["entityIndex"];
    if (typeof entityIndex === "number") {
      return { pieceName, entityIndex };
    }
  }
  return null;
}

/**
 * Paints all primitives for a given EventPiece.
 *
 * Painters own the entity↔object mapping: as a painter builds scene objects
 * it registers them per entity index (a plain array — entity id ≡ index, no
 * lookup maps). The mapping powers selection both ways: a 3D pick resolves
 * to (piece, entityIndex) via `entityRefOf`, and a model-tree selection
 * resolves to scene objects via `objectForEntity`.
 */
export abstract class EventPiecePainter {

  /** Scene object per entity index; holes where no object was built. */
  protected entityObjects: (Object3D | null)[] = [];

  /**
   * The painter's resolved knobs. Always usable: without an injected view the
   * declared defaults from `static meta` apply (workers, scripts, tests).
   */
  protected config: PainterConfigView;

  /** Constructor is public since we can instantiate directly */
  constructor(protected parentNode: Object3D, protected piece: EventPiece, config?: PainterConfigView) {
    this.config = config ?? defaultPainterConfigView(painterMetaOf(this.constructor as PiecePainterConstructor));
  }

  /** Gets the `type` identifier for the piece this class works with */
  public get pieceType() {
    return this.piece.type;
  }

  /** The name of the painted piece (unique within its event). */
  public get pieceName() {
    return this.piece.name;
  }

  /**
   * The scene group holding everything this painter builds. Piece-level
   * show/hide (the model tree eye, `painters.byPiece.<name>.visible`) flips
   * `visible` here instead of touching individual entity objects.
   */
  public get node(): Object3D {
    return this.parentNode;
  }

  /**
   * Records the scene object of one entity and stamps it so `entityRefOf`
   * can resolve the object (or its mesh children) back to the entity.
   * Painters call this as they build objects.
   */
  protected registerEntityObject(entityIndex: number, object: Object3D): void {
    this.entityObjects[entityIndex] = object;
    object.userData["pieceName"] = this.piece.name;
    object.userData["entityIndex"] = entityIndex;
  }

  /** The scene object built for an entity, or null when there is none. */
  public objectForEntity(entityIndex: number): Object3D | null {
    return this.entityObjects[entityIndex] ?? null;
  }

  /**
   * Applies the highlight visual of one entity. The default runs the
   * `highlightFunction` the painter stored on the entity's object; painters
   * with special highlight needs override this instead.
   */
  public highlightEntity(entityIndex: number): void {
    const object = this.objectForEntity(entityIndex);
    const highlight = object?.userData["highlightFunction"];
    if (typeof highlight === "function") highlight();
  }

  /** Reverts `highlightEntity` (default: the stored `unhighlightFunction`). */
  public unhighlightEntity(entityIndex: number): void {
    const object = this.objectForEntity(entityIndex);
    const unhighlight = object?.userData["unhighlightFunction"];
    if (typeof unhighlight === "function") unhighlight();
  }

  /**
   * Called after any of the painter's config knobs changed. Painters restyle
   * their existing objects here (colors, widths) — a knob change must not
   * require a rebuild or a data reload.
   */
  onConfigChanged(): void {}

  /**
   * Paints
   * @param time - time in [ns], null - draw in non-dynamic mode (all visible)
   */
  abstract paint(time: number | null): void;

  /** Dispose method to clean up resources */
  public dispose(): void {
    this.entityObjects = [];
    // Remove node from the scene
    if (this.parentNode) {
      disposeNode(this.parentNode);
    }
  }
}
