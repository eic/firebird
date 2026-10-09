// The default painters stamp every entity object, so a 3D pick on any part
// of an entity resolves back to (piece name, entity index) through
// entityRefOf - the contract SelectionService relies on. Painted the way
// workers and scripts paint: DataModelPainter + registerDefaultPainters.
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { DataModelPainter } from './data-model-painter';
import { registerDefaultPainters } from './default-painters';
import { EventPiecePainter, entityRefOf } from './event-piece-painter';
import { Event } from '../model/event';
import type { EventPiece } from '../model/event-piece';
import { BoxHitPiece } from '../model/box-hit.piece';
import { PointTrajectoryPiece } from '../model/point-trajectory.piece';

function hitsPiece(): BoxHitPiece {
  const piece = new BoxHitPiece('Hits');
  piece.count = 3;
  piece.pos = new Float32Array([0, 0, 0, 10, 0, 0, 20, 0, 0]);
  piece.dim = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  piece.time = new Float32Array([1, 2, 3]);
  return piece;
}

function tracksPiece(): PointTrajectoryPiece {
  const piece = new PointTrajectoryPiece('Tracks');
  piece.pointColumns = ['x', 'y', 'z', 't'];
  piece.count = 2;
  piece.columns = { pdg: [11, 22], charge: [-1, 0] };
  piece.points = [
    [[0, 0, 0, 10], [10, 0, 0, 20]],
    [[0, 10, 0, 15], [10, 10, 0, 25], [20, 10, 0, 35]],
  ];
  return piece;
}

function paintEvent(): DataModelPainter {
  const painter = new DataModelPainter();
  registerDefaultPainters(painter);
  painter.setThreeSceneParent(new Group());
  const event = new Event();
  event.pieces = [hitsPiece(), tracksPiece()];
  painter.setEntry(event);
  return painter;
}

describe('entityRefOf with the default painters', () => {
  for (const [pieceName, entityCount] of [['Hits', 3], ['Tracks', 2]] as const) {
    it(`resolves every ${pieceName} entity object, and a child of it, to its entity`, () => {
      const painter = paintEvent().painterFor(pieceName)!;
      for (let entityIndex = 0; entityIndex < entityCount; entityIndex++) {
        const object = painter.objectForEntity(entityIndex)!;
        expect(entityRefOf(object)).toEqual({ pieceName, entityIndex });

        const child = new Object3D();
        object.add(child);
        expect(entityRefOf(child)).toEqual({ pieceName, entityIndex });
      }
    });
  }

  it('returns null for objects no painter stamped', () => {
    paintEvent();
    expect(entityRefOf(new Mesh())).toBeNull();
  });
});

// A painter that keeps the base dispose() must still free what it built:
// cleanupCurrentEntry() (every setEntry) disposes the whole subtree of its
// node, so the renderer releases the GPU buffers of every child.
describe('EventPiecePainter.dispose', () => {
  class NestedMeshPainter extends EventPiecePainter {
    readonly meshes: Mesh<BoxGeometry, MeshBasicMaterial>[] = [];
    constructor(node: Object3D, piece: EventPiece) {
      super(node, piece);
      const holder = new Group();
      for (let i = 0; i < 2; i++) {
        const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
        holder.add(mesh);
        this.meshes.push(mesh);
      }
      node.add(holder);
    }
    paint(): void { /* nothing to animate */ }
  }

  it('disposes the geometries and materials of every child after the next setEntry', () => {
    const painter = new DataModelPainter();
    painter.registerPainter(BoxHitPiece.type, NestedMeshPainter);
    const scene = new Group();
    painter.setThreeSceneParent(scene);

    const first = new Event();
    first.pieces = [hitsPiece()];
    painter.setEntry(first);
    const built = painter.painterFor('Hits') as NestedMeshPainter;
    const disposed: string[] = [];
    built.meshes.forEach((mesh, index) => {
      mesh.geometry.addEventListener('dispose', () => disposed.push(`geometry ${index}`));
      mesh.material.addEventListener('dispose', () => disposed.push(`material ${index}`));
    });

    painter.setEntry(new Event());

    expect(disposed.sort()).toEqual(['geometry 0', 'geometry 1', 'material 0', 'material 1']);
    expect(scene.children).toEqual([]);
  });
});
