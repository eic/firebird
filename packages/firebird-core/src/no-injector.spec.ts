/**
 * The PLAN §3 honesty test: firebird-core must work with no Angular injector
 * and no bootstrap - the event-loader and geometry-loader web workers run this
 * code, and workers have no DI. This spec is the enforced form of that
 * constraint: it parses a DEX file and paints it into a bare three.js Scene
 * using only core classes. If an @Injectable, token, or HttpClient sneaks into
 * core, this spec is where it breaks.
 *
 * (Naming note: the PLAN sketch uses `PainterRegistry`; until the Phase 2
 * extension system lands, `DataModelPainter` carries that role.)
 */
import { Scene } from 'three';
import { DataExchange, DataModelPainter } from './index';

const DEX_SAMPLE = {
  type: 'firebird-dex-json',
  version: '0.04',
  origin: { by: 'no-injector.spec' },
  events: [
    {
      id: 'event_0',
      groups: [
        {
          name: 'TestHits',
          type: 'BoxHit',
          origin: { by: 'spec' },
          hits: [
            { pos: [10, 20, 30], dim: [1, 1, 1], t: [0, 0], ed: [0.001, 0] },
            { pos: [40, 50, 60], dim: [2, 2, 2], t: [5, 0], ed: [0.002, 0] },
          ],
        },
        {
          name: 'TestTracks',
          type: 'PointTrajectory',
          origin: { by: 'spec' },
          paramColumns: ['theta'],
          pointColumns: ['x', 'y', 'z', 't'],
          trajectories: [
            { points: [[0, 0, 0, 0], [10, 10, 10, 1], [20, 15, 30, 2]], params: [0.5] },
          ],
        },
      ],
    },
  ],
};

describe('firebird-core without an injector (PLAN §3)', () => {
  it('parses DEX and paints an event into a bare Scene', () => {
    const dex = DataExchange.fromDexObj(DEX_SAMPLE);
    expect(dex.events.length).toBe(1);
    expect(dex.events[0].groups.length).toBe(2);

    const scene = new Scene();
    const painter = new DataModelPainter();
    painter.setThreeSceneParent(scene);
    painter.setEntry(dex.events[0]);
    painter.paint(null);

    // The painter must have created three.js objects under the scene.
    let meshCount = 0;
    scene.traverse(() => meshCount++);
    expect(meshCount).toBeGreaterThan(2);

    // Time filtering runs without any framework machinery either.
    painter.paint(1.5);
  });
});
