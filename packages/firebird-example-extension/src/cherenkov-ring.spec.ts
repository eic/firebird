/**
 * The example extension as a template: the piece decodes DEX columns and
 * rejects malformed ones, and the painter reads its ring color knob through
 * `this.config`, restyles live in `onConfigChanged()`, and shows rings by
 * event time.
 */
import { describe, expect, it } from 'vitest';
import { Group, Line, LineBasicMaterial } from 'three';
import {
  PainterConfigView,
  RESERVED_PAINTER_KNOB_KEYS,
  assertPainterKnobKeys,
  defaultPainterConfigView,
} from '@dexvis/firebird-core';
import { Signal, signal } from '@angular/core';
import { CherenkovRingPiece, CherenkovRingPieceFactory } from './cherenkov-ring.piece';
import { CherenkovRingPainter } from './cherenkov-ring.painter';

function ringsDex(overrides: Record<string, unknown> = {}) {
  return {
    name: 'ExampleRings',
    type: 'example.CherenkovRing',
    version: '1.0',
    count: 2,
    columns: {
      center: [0, 0, 1200, 100, 0, 1200],
      radius: [600, 450],
      nPhotons: [14, 9],
      time: [5, 8],
      track: [0, -1],
    },
    refs: { track: 'ExampleTracks' },
    ...overrides,
  };
}

/** A config view whose ring color the test changes, like a knob edit in the painter panel. */
function editableConfig(ringColor: string) {
  const color = signal(ringColor);
  const view: PainterConfigView = {
    value: <T>(key: string) => (key === 'ringColor' ? color() : undefined) as T,
    signal: <T>() => color as unknown as Signal<T>,
  };
  return { view, color };
}

function ringColors(node: Group): string[] {
  const colors: string[] = [];
  node.traverse(object => {
    if (object instanceof Line) colors.push((object.material as LineBasicMaterial).color.getHexString());
  });
  return colors;
}

function paintRings(config?: PainterConfigView) {
  const piece = new CherenkovRingPieceFactory().fromDexObject(ringsDex()) as CherenkovRingPiece;
  const node = new Group();
  const painter = new CherenkovRingPainter(node, piece, config);
  return { piece, node, painter };
}

describe('CherenkovRingPiece', () => {
  it('decodes the columns and the ring -> track reference', () => {
    const piece = new CherenkovRingPieceFactory().fromDexObject(ringsDex()) as CherenkovRingPiece;
    expect(piece.count).toBe(2);
    expect(Array.from(piece.radius)).toEqual([600, 450]);
    expect(piece.timeRange).toEqual([5, 8]);
    expect(piece.entityRefs(0)).toEqual([{ column: 'track', targetPiece: 'ExampleTracks', targetIndex: 0 }]);
    expect(piece.entityRefs(1)).toEqual([]);
    expect(piece.toDexObject().columns.radius).toEqual([600, 450]);
  });

  it('rejects a column whose length disagrees with count', () => {
    expect(() => CherenkovRingPiece.fromDexObject(ringsDex({ count: 3 }))).toThrow(/radius|center/);
  });
});

describe('CherenkovRingPainter', () => {
  it('declares its ring color as a knob, with no reserved knob names', () => {
    expect(CherenkovRingPainter.meta.configs?.map(knob => knob.key)).toEqual(['ringColor']);
    expect(RESERVED_PAINTER_KNOB_KEYS).not.toContain('ringColor');
    expect(() => assertPainterKnobKeys(CherenkovRingPainter)).not.toThrow();
  });

  it('paints in the knob default without a config system (workers, scripts)', () => {
    const { node } = paintRings();
    expect(defaultPainterConfigView(CherenkovRingPainter.meta).value('ringColor')).toBe('#00e5ff');
    expect(ringColors(node)).toEqual(['00e5ff', '00e5ff']);
  });

  it('builds rings in the configured color and restyles them live on knob changes', () => {
    const { view, color } = editableConfig('#ff0000');
    const { node, painter } = paintRings(view);
    expect(ringColors(node)).toEqual(['ff0000', 'ff0000']);

    color.set('#00ff00');
    painter.onConfigChanged();
    expect(ringColors(node)).toEqual(['00ff00', '00ff00']);
  });

  it('keeps a highlighted ring white through a restyle, and returns it to the knob color', () => {
    const { view, color } = editableConfig('#ff0000');
    const { node, painter } = paintRings(view);
    painter.highlightEntity(1);
    color.set('#0000ff');
    painter.onConfigChanged();
    expect(ringColors(node)).toEqual(['0000ff', 'ffffff']);

    painter.unhighlightEntity(1);
    expect(ringColors(node)).toEqual(['0000ff', '0000ff']);
  });

  it('shows a ring once the event time passed its production time', () => {
    const { node, painter } = paintRings();
    const rings: Line[] = [];
    node.traverse(object => { if (object instanceof Line) rings.push(object); });

    painter.paint(6);
    expect(rings.map(ring => ring.visible)).toEqual([true, false]);
    painter.paint(null);
    expect(rings.map(ring => ring.visible)).toEqual([true, true]);
  });

  it('maps each ring object back to its entity index for selection', () => {
    const { painter } = paintRings();
    expect(painter.objectForEntity(1)?.userData['entityIndex']).toBe(1);
    expect(painter.objectForEntity(1)?.userData['pieceName']).toBe('ExampleRings');
  });
});
