/**
 * One reference from an entity into another piece: the declaring column,
 * the target piece name (from the piece `refs` declaration) and the target
 * entity index (entity id ≡ array index; -1 never appears here — refs that
 * hold -1 are "no reference" and are not reported).
 */
export interface EntityRefLink {
  column: string;
  targetPiece: string;
  targetIndex: number;
}

/**
 * The EventPiece class is an abstract base class for all event components.
 * A "piece" is one named block of typed entity data inside an event —
 * a hits collection, a set of trajectories, a custom extension type.
 */
export abstract class EventPiece {

  /**
   * The name of the piece, unique within its event. Shown in UI menus and
   * targeted by `refs` declarations of other pieces.
   */
  name: string;

  /**
   * The type of the piece, used to identify the piece class
   * and facilitate deserialization and factory lookup.
   */
  type: string;

  /**
   * An optional value indicating the origin of the piece,
   * such as the original EDM4EIC/EDM4HEP/C++ data type from which it was derived.
   */
  origin?: any;

  /**
   * The constructor is protected to prevent direct instantiation of the abstract class.
   * Only derived classes can call this constructor when they implement their own constructors.
   *
   * @param name - The name of the piece.
   * @param type - The type of the piece.
   * @param origin - Optional origin of the piece.
   */
  protected constructor(name: string, type: string, origin?: any) {
    this.name = name;
    this.type = type;
    this.origin = origin;
  }

  /**
   * Serializes the piece into a JSON-compatible object following the
   * Data Exchange format (a DEX v1 piece object).
   */
  abstract toDexObject(): any;

  // -------------------------------------------------------------------------
  // Entity introspection — powers model-oriented UI (the model tree panel)
  // without UI code knowing concrete piece classes. Entity id ≡ array index.
  // -------------------------------------------------------------------------

  /** Number of entities in this piece. Pieces with a `count` field report it. */
  get entityCount(): number {
    const count = (this as { count?: unknown }).count;
    return typeof count === 'number' ? count : 0;
  }

  /**
   * A short human-readable label for one entity. The default is the index;
   * pieces with meaningful columns (pdg, time, energy) override this.
   */
  entityLabel(entityIndex: number): string {
    return `#${entityIndex}`;
  }

  /**
   * The outgoing references of one entity, resolved from the piece's `refs`
   * declaration: which column points at which entity of which piece.
   * Values of -1 mean "no reference" and are not reported.
   */
  entityRefs(entityIndex: number): EntityRefLink[] {
    return [];
  }

  /** min and max time of the EventPiece
   * null means the piece doesn't need time and shows as is
   *
   * @returns [min, max] range of times or null if it is not available for the piece
   */
  abstract get timeRange(): [number, number] | null;
}

/**
 * The EventPieceFactory interface defines the structure for factory classes
 * that are responsible for creating instances of EventPiece subclasses.
 */
export interface EventPieceFactory {

  /**
   * The type of the piece that this factory creates.
   * This should match the `type` property of the pieces it creates.
   */
  type: string;

  /**
   * Method to create an instance of an EventPiece subclass from a deserialized
   * DEX v1 piece object (typically parsed from JSON).
   *
   * @param obj - The deserialized piece object.
   * @returns An instance of an EventPiece subclass.
   */
  fromDexObject(obj: any): EventPiece;
}

/**
 * The pieceRegistry is a mapping from piece type strings to their corresponding factories.
 * It is used to look up the appropriate factory when deserializing pieces from JSON data.
 * This registry enables the system to support multiple piece types dynamically.
 */
const pieceRegistry: { [type: string]: EventPieceFactory } = {};

/**
 * Registers a new piece factory in the registry.
 * This allows the factory to be used during deserialization to create instances
 * of the piece it represents.
 *
 * @param factory - The factory to register.
 */
export function registerEventPieceFactory(factory: EventPieceFactory): void {
  pieceRegistry[factory.type] = factory;
}

/**
 * Retrieves a piece factory from the registry based on the piece type.
 *
 * @param type - The type of the piece.
 * @returns The corresponding EventPieceFactory, or undefined if not found.
 */
export function getEventPieceFactory(type: string): EventPieceFactory | undefined {
  return pieceRegistry[type];
}

/**
 * Resets the piece registry.
 * This function is intended for internal use during testing.
 *
 * @internal
 */
export function _resetEventPieceRegistry(): void {
  for (const key in pieceRegistry) {
    delete pieceRegistry[key];
  }
}

// ---------------------------------------------------------------------------
// Column reading helpers for piece factories.
//
// DEX v1 stores entity data as parallel arrays: a scalar column holds `count`
// values, a fixed-width vector column (like an xyz position) holds
// `stride * count` values flattened. Entity id IS the array index — malformed
// files fail loudly here instead of producing silently shifted data (v1 files
// are cheap to regenerate).
// ---------------------------------------------------------------------------

/** Reads the piece `count` field; throws with the piece name on bad data. */
export function readPieceCount(obj: any): number {
  const count = obj?.['count'];
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new Error(`DEX piece '${obj?.['name']}': "count" must be a non-negative integer, got ${count}`);
  }
  return count;
}

/**
 * Reads a required numeric column into a Float32Array (bulk copy, no
 * per-entity objects). `stride` is values per entity (1 = scalar, 3 = xyz).
 */
export function readNumberColumn(obj: any, columnName: string, count: number, stride: number = 1): Float32Array {
  const column = readOptionalNumberColumn(obj, columnName, count, stride);
  if (column === null) {
    throw new Error(`DEX piece '${obj?.['name']}': required column "${columnName}" is missing`);
  }
  return column;
}

/** Same as readNumberColumn but returns null when the writer omitted the column. */
export function readOptionalNumberColumn(obj: any, columnName: string, count: number, stride: number = 1): Float32Array | null {
  const column = obj?.['columns']?.[columnName];
  if (column === undefined || column === null) {
    return null;
  }
  if (!Array.isArray(column)) {
    throw new Error(`DEX piece '${obj?.['name']}': column "${columnName}" is not an array`);
  }
  if (column.length !== stride * count) {
    throw new Error(`DEX piece '${obj?.['name']}': column "${columnName}" has ${column.length} values, ` +
      `expected ${stride}*count=${stride * count} (entity id must equal array index)`);
  }
  return Float32Array.from(column);
}
