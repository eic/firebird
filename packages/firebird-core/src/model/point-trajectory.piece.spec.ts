// point-trajectory.piece.spec.ts

import { PointTrajectoryPiece, PointTrajectoryPieceFactory } from './point-trajectory.piece';

const DEX_PIECE = {
  name: 'CentralTracks',
  type: 'PointTrajectory',
  version: '1.0',
  origin: { by: 'spec' },
  count: 2,
  columns: {
    theta: [0.5, 1.5],
    pdg: [11, -211],
  },
  pointColumns: ['x', 'y', 'z', 't'],
  points: [
    [[0, 0, 0, 0], [10, 10, 10, 1]],
    [[0, 0, 0, 2], [20, 20, 20, 5], [30, 30, 30, 9]],
  ],
  refs: { particle: 'McParticles' },
};

describe('PointTrajectoryPieceFactory', () => {
  it('adopts param columns and ragged points, id == index', () => {
    const piece = new PointTrajectoryPieceFactory().fromDexObject(DEX_PIECE);

    expect(piece.count).toBe(2);
    expect(piece.columns['theta']).toEqual([0.5, 1.5]);
    expect(piece.param('pdg', 1)).toBe(-211);
    expect(piece.param('missing', 0)).toBeNull();
    expect(piece.pointColumns).toEqual(['x', 'y', 'z', 't']);
    expect(piece.points[1].length).toBe(3);
    expect(piece.refs['particle']).toBe('McParticles');
  });

  it('sorts each trajectory by time', () => {
    const shuffled = {
      ...DEX_PIECE,
      count: 1,
      columns: {},
      refs: undefined,
      points: [[[5, 5, 5, 9], [1, 1, 1, 2], [3, 3, 3, 4]]],
    };
    const piece = new PointTrajectoryPieceFactory().fromDexObject(shuffled);
    expect(piece.points[0].map(p => p[3])).toEqual([2, 4, 9]);
  });

  it('throws loudly when points or columns do not match count', () => {
    const factory = new PointTrajectoryPieceFactory();
    expect(() => factory.fromDexObject({ ...DEX_PIECE, points: [[[0, 0, 0, 0]]] })).toThrow(/points/);
    expect(() => factory.fromDexObject({ ...DEX_PIECE, columns: { theta: [0.5] } })).toThrow(/theta/);
  });
});

describe('PointTrajectoryPiece', () => {
  it('computes timeRange over all trajectories', () => {
    const piece = new PointTrajectoryPieceFactory().fromDexObject(DEX_PIECE);
    expect(piece.timeRange).toEqual([0, 9]);
  });

  it('has null timeRange without a time point column', () => {
    const noTime = {
      ...DEX_PIECE,
      pointColumns: ['x', 'y', 'z'],
      points: [[[0, 0, 0]], [[1, 1, 1]]],
    };
    const piece = new PointTrajectoryPieceFactory().fromDexObject(noTime);
    expect(piece.timeRange).toBeNull();
  });

  it('round-trips through toDexObject', () => {
    const factory = new PointTrajectoryPieceFactory();
    const piece = factory.fromDexObject(DEX_PIECE);
    const dexObject = piece.toDexObject();

    expect(dexObject.type).toBe(PointTrajectoryPiece.type);
    expect(dexObject.count).toBe(2);
    expect(dexObject.columns.pdg).toEqual([11, -211]);
    expect(dexObject.refs).toEqual({ particle: 'McParticles' });

    const reparsed = factory.fromDexObject(dexObject);
    expect(reparsed.points).toEqual(piece.points);
    expect(reparsed.columns).toEqual(piece.columns);
  });
});
