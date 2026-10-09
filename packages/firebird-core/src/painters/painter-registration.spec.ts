// Painter registration rejects reserved knob names (they collide with keys
// the display owns), and keeps accepting the built-in painters.
import { Object3D } from 'three';
import { DataModelPainter } from './data-model-painter';
import {
  EventPiecePainter,
  PainterMeta,
  RESERVED_PAINTER_KNOB_KEYS,
  assertPainterKnobKeys,
} from './event-piece-painter';
import { TrajectoryPainter } from './trajectory.painter';
import { BatchedTrajectoryPainter } from './batched-trajectory.painter';
import { BoxHitSimplePainter } from './box-hit-simple.painter';

function painterWithKnob(key: string) {
  return class extends EventPiecePainter {
    static meta: PainterMeta = {
      id: `knob-${key}`,
      forPieceTypes: ['spec.Type'],
      configs: [{ key: 'width', default: 1 }, { key, default: true }],
    };
    paint(): void { /* nothing to draw */ }
    override dispose(): void { /* nothing to free */ }
  };
}

describe('painter registration', () => {
  it('reserves the knob names time and visible', () => {
    expect([...RESERVED_PAINTER_KNOB_KEYS].sort()).toEqual(['time', 'visible']);
  });

  for (const reserved of ['time', 'visible']) {
    it(`throws for a painter that declares the knob '${reserved}'`, () => {
      const registry = new DataModelPainter();
      const painterClass = painterWithKnob(reserved);
      expect(() => registry.registerPainter('spec.Type', painterClass))
        .toThrowError(new RegExp(`'knob-${reserved}'.*'${reserved}'.*reserved`));
      expect(registry.piecePainterRegistry['spec.Type'] ?? []).not.toContain(painterClass);
    });
  }

  it('accepts other knob names and painters without meta', () => {
    const registry = new DataModelPainter();
    expect(() => registry.registerPainter('spec.Type', painterWithKnob('visibleFraction'))).not.toThrow();
    class NoMeta extends EventPiecePainter {
      constructor(node: Object3D, piece: any) { super(node, piece); }
      paint(): void { /* nothing to draw */ }
      override dispose(): void { /* nothing to free */ }
    }
    expect(() => assertPainterKnobKeys(NoMeta)).not.toThrow();
  });

  it('accepts the built-in painters', () => {
    for (const painterClass of [TrajectoryPainter, BatchedTrajectoryPainter, BoxHitSimplePainter]) {
      expect(() => assertPainterKnobKeys(painterClass)).not.toThrow();
    }
  });
});
