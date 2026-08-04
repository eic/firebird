// event-piece.spec.ts

import {
  EventPiece,
  EventPieceFactory,
  registerEventPieceFactory,
  getEventPieceFactory,
  _resetEventPieceRegistry,
  readPieceCount,
  readNumberColumn,
  readOptionalNumberColumn,
} from './event-piece';

describe('EventPiece', () => {
  it('should be defined as an abstract class', () => {
    expect(EventPiece).toBeDefined();
    expect(typeof EventPiece).toBe('function');
  });
});

describe('Piece Registry', () => {
  class TestPieceFactory implements EventPieceFactory {
    type: string = 'TestType';

    fromDexObject(obj: any): EventPiece {
      return new TestEventPiece(obj['name'], obj['origin']);
    }
  }

  class TestEventPiece extends EventPiece {
    override get timeRange(): [number, number] | null {
      return [0, 100];
    }
    constructor(name: string, origin?: string) {
      super(name, 'TestType', origin);
    }

    toDexObject(): any {
      return {
        name: this.name,
        type: this.type,
        origin: this.origin,
      };
    }
  }

  beforeEach(() => {
    _resetEventPieceRegistry();
  });

  it('should register and retrieve piece factories correctly', () => {
    const factory = new TestPieceFactory();
    registerEventPieceFactory(factory);
    expect(getEventPieceFactory('TestType')).toBe(factory);
  });

  it('should return undefined for unregistered piece types', () => {
    expect(getEventPieceFactory('UnknownType')).toBeUndefined();
  });

  it('should overwrite existing factory when registering a factory with the same type', () => {
    const factory1 = new TestPieceFactory();
    const factory2 = new TestPieceFactory();
    registerEventPieceFactory(factory1);
    registerEventPieceFactory(factory2);
    expect(getEventPieceFactory('TestType')).toBe(factory2);
  });

  it('should use the correct factory to create piece instances', () => {
    registerEventPieceFactory(new TestPieceFactory());

    const dexObject = {
      name: 'TestEventPiece',
      type: 'TestType',
      origin: 'TestOrigin',
    };

    const piece = getEventPieceFactory('TestType')!.fromDexObject(dexObject);
    expect(piece).toBeInstanceOf(EventPiece);
    expect(piece.name).toBe('TestEventPiece');
    expect(piece.type).toBe('TestType');
    expect(piece.origin).toBe('TestOrigin');
  });
});

describe('column reading helpers', () => {
  const piece = {
    name: 'Hits',
    count: 2,
    columns: {
      pos: [1, 2, 3, 4, 5, 6],
      time: [10, 20],
    },
  };

  it('reads counts and columns as typed arrays', () => {
    expect(readPieceCount(piece)).toBe(2);
    const pos = readNumberColumn(piece, 'pos', 2, 3);
    expect(pos).toBeInstanceOf(Float32Array);
    expect(Array.from(pos)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(readNumberColumn(piece, 'time', 2))).toEqual([10, 20]);
  });

  it('returns null for omitted optional columns', () => {
    expect(readOptionalNumberColumn(piece, 'edep', 2)).toBeNull();
  });

  it('throws loudly on bad counts', () => {
    expect(() => readPieceCount({ name: 'X', count: -1 })).toThrow(/count/);
    expect(() => readPieceCount({ name: 'X', count: 1.5 })).toThrow(/count/);
    expect(() => readPieceCount({ name: 'X' })).toThrow(/count/);
  });

  it('throws loudly on length mismatches (id must equal index)', () => {
    expect(() => readNumberColumn(piece, 'pos', 3, 3)).toThrow(/pos/);
    expect(() => readNumberColumn(piece, 'time', 3)).toThrow(/time/);
    expect(() => readNumberColumn(piece, 'missing', 2)).toThrow(/missing/);
  });
});
