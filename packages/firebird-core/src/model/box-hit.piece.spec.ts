// box-hit.piece.spec.ts

import { BoxHitPiece, BoxHitPieceFactory } from './box-hit.piece';

const DEX_PIECE = {
  name: 'BarrelHits',
  type: 'BoxHit',
  version: '1.0',
  origin: { by: 'spec' },
  count: 2,
  columns: {
    pos: [1, 2, 3, 4, 5, 6],
    dim: [0.1, 0.1, 0.1, 0.2, 0.2, 0.2],
    time: [4, 5],
    timeError: [1, 1],
    edep: [0.001, 0.002],
    edepError: [0.0001, 0.0002],
  },
};

describe('BoxHitPieceFactory', () => {
  it('bulk-copies columns into typed arrays, id == index', () => {
    const piece = new BoxHitPieceFactory().fromDexObject(DEX_PIECE);

    expect(piece.name).toBe('BarrelHits');
    expect(piece.type).toBe(BoxHitPiece.type);
    expect(piece.count).toBe(2);
    expect(piece.pos).toBeInstanceOf(Float32Array);
    // hit 1 is at pos[3..5]
    expect(Array.from(piece.pos.slice(3, 6))).toEqual([4, 5, 6]);
    expect(piece.time![1]).toBe(5);
    expect(piece.edep![0]).toBeCloseTo(0.001);
  });

  it('leaves omitted optional columns null (sim writers omit error columns)', () => {
    const simPiece = new BoxHitPieceFactory().fromDexObject({
      name: 'SimHits', type: 'BoxHit', version: '1.0', count: 1,
      columns: { pos: [1, 2, 3], dim: [2, 2, 2], time: [7], edep: [0.001] },
    });
    expect(simPiece.timeError).toBeNull();
    expect(simPiece.edepError).toBeNull();
    expect(simPiece.time![0]).toBe(7);
  });

  it('throws loudly on malformed columns', () => {
    const bad = { ...DEX_PIECE, columns: { ...DEX_PIECE.columns, pos: [1, 2, 3] } };
    expect(() => new BoxHitPieceFactory().fromDexObject(bad)).toThrow(/pos/);
  });
});

describe('BoxHitPiece', () => {
  it('computes timeRange from the time column', () => {
    const piece = new BoxHitPieceFactory().fromDexObject(DEX_PIECE);
    expect(piece.timeRange).toEqual([4, 5]);
  });

  it('has null timeRange without a time column', () => {
    const piece = new BoxHitPieceFactory().fromDexObject({
      name: 'X', type: 'BoxHit', version: '1.0', count: 1,
      columns: { pos: [0, 0, 0], dim: [1, 1, 1] },
    });
    expect(piece.timeRange).toBeNull();
  });

  it('round-trips through toDexObject', () => {
    const factory = new BoxHitPieceFactory();
    const piece = factory.fromDexObject(DEX_PIECE);
    const dexObject = piece.toDexObject();

    expect(dexObject.type).toBe('BoxHit');
    expect(dexObject.version).toBe('1.0');
    expect(dexObject.count).toBe(2);
    expect(dexObject.columns.pos).toEqual([1, 2, 3, 4, 5, 6]);
    expect(dexObject.columns.time).toEqual([4, 5]);

    const reparsed = factory.fromDexObject(dexObject);
    expect(Array.from(reparsed.pos)).toEqual(Array.from(piece.pos));
    expect(Array.from(reparsed.time!)).toEqual(Array.from(piece.time!));
  });
});
