import { Group } from 'three';
import { BatchedTrajectoryPainter } from './batched-trajectory.painter';
import { PointTrajectoryPiece } from '../model/point-trajectory.piece';
import { entityRefOf } from './event-piece-painter';

describe('BatchedTrajectoryPainter', () => {
  let mockParentNode: Group;
  let piece: PointTrajectoryPiece;

  beforeEach(() => {
    mockParentNode = new Group();
    vi.spyOn(mockParentNode, 'add');
    vi.spyOn(mockParentNode, 'remove');

    piece = new PointTrajectoryPiece('TestTrajectories');
    piece.pointColumns = ['x', 'y', 'z', 't'];
    piece.count = 3;
    piece.columns = {
      pdg: [11, 22, 2212], // electron (solid), gamma (dashed), proton (solid)
      charge: [-1, 0, 1],
    };
    piece.points = [
      [[0, 0, 0, 10], [10, 0, 0, 20]],                      // 1 segment,  t=10
      [[0, 10, 0, 15], [10, 10, 0, 25], [20, 10, 0, 35]],   // 2 segments, t=15,25
      [[0, 20, 0, 40], [10, 20, 0, 50]],                    // 1 segment,  t=40
    ];
  });

  it('builds one solid and one dashed batch covering all segments', () => {
    const painter = new BatchedTrajectoryPainter(mockParentNode, piece);
    const batches = (painter as any).batches;
    expect(batches.length).toBe(2);
    const solid = batches.find((b: any) => !b.dashed);
    const dashed = batches.find((b: any) => b.dashed);
    // electron 1 + proton 1 segments solid; gamma 2 segments dashed
    expect(solid.count).toBe(2);
    expect(dashed.count).toBe(3 - 1); // gamma has 3 points -> 2 segments
    expect(mockParentNode.add).toHaveBeenCalledTimes(2);
  });

  it('sorts segments by start time and cuts with instanceCount', () => {
    const painter = new BatchedTrajectoryPainter(mockParentNode, piece);
    const batches = (painter as any).batches;
    for (const batch of batches) {
      for (let i = 1; i < batch.count; i++) {
        expect(batch.startTimes[i]).toBeGreaterThanOrEqual(batch.startTimes[i - 1]);
      }
    }

    const solid = batches.find((b: any) => !b.dashed);
    const dashed = batches.find((b: any) => b.dashed);

    painter.paint(5); // before everything
    expect(solid.geometry.instanceCount).toBe(0);
    expect(dashed.geometry.instanceCount).toBe(0);

    painter.paint(30); // electron segment (t=10) + gamma segments (t=15, 25)
    expect(solid.geometry.instanceCount).toBe(1);
    expect(dashed.geometry.instanceCount).toBe(2);

    painter.paint(null); // timeless: everything
    expect(solid.geometry.instanceCount).toBe(solid.count);
    expect(dashed.geometry.instanceCount).toBe(dashed.count);
  });

  it('resolves a picked segment to its trajectory through entityRefOf', () => {
    const painter = new BatchedTrajectoryPainter(mockParentNode, piece);
    const dashed = (painter as any).batches.find((b: any) => b.dashed);
    // Every dashed segment belongs to the gamma (trajectory id 1)
    const ref = entityRefOf(dashed.object, { faceIndex: 0 });
    expect(ref).toEqual({ pieceName: 'TestTrajectories', entityIndex: 1 });
  });

  it('recolors a track for highlight and restores it after', () => {
    const painter = new BatchedTrajectoryPainter(mockParentNode, piece);
    const solid = (painter as any).batches.find((b: any) => !b.dashed);
    const protonSegment = [...solid.trackIds].indexOf(2);
    const before = solid.colors.slice(protonSegment * 6, protonSegment * 6 + 3);

    painter.highlightEntity(2);
    const highlighted = solid.colors.slice(protonSegment * 6, protonSegment * 6 + 3);
    expect([...highlighted]).not.toEqual([...before]);

    painter.unhighlightEntity(2);
    const restored = solid.colors.slice(protonSegment * 6, protonSegment * 6 + 3);
    expect([...restored].map(v => v.toFixed(5))).toEqual([...before].map(v => v.toFixed(5)));
  });

  it('disposes both batch objects', () => {
    const painter = new BatchedTrajectoryPainter(mockParentNode, piece);
    painter.dispose();
    expect((painter as any).batches.length).toBe(0);
    expect(mockParentNode.remove).toHaveBeenCalledTimes(2);
  });
});
