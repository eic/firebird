/**
 * firebird-core must work with no Angular injector and no bootstrap - the
 * geometry-loader web worker runs this code, and workers have no DI (event
 * parsing is expected to move off the main thread the same way). This spec
 * is the enforced form of that constraint: it parses
 * a DEX file and paints it into a bare three.js Scene using only core
 * classes. If an @Injectable, token, or HttpClient sneaks into core, this
 * spec is where it breaks.
 */
import { Scene } from 'three';
import { DataExchange, DataModelPainter, initPieceFactories, registerDefaultPainters } from './index';

const DEX_SAMPLE = {
  type: 'firebird-dex-json',
  version: '1.0',
  origin: { by: 'no-injector.spec' },
  events: [
    {
      id: 'event_0',
      pieces: [
        {
          name: 'TestHits',
          type: 'BoxHit',
          version: '1.0',
          origin: { by: 'spec' },
          count: 2,
          columns: {
            pos: [10, 20, 30, 40, 50, 60],
            dim: [1, 1, 1, 2, 2, 2],
            time: [0, 5],
            edep: [0.001, 0.002],
          },
        },
        {
          name: 'TestTracks',
          type: 'PointTrajectory',
          version: '1.0',
          origin: { by: 'spec' },
          count: 1,
          columns: { theta: [0.5] },
          pointColumns: ['x', 'y', 'z', 't'],
          points: [
            [[0, 0, 0, 0], [10, 10, 10, 1], [20, 15, 30, 2]],
          ],
        },
      ],
    },
  ],
};

describe('firebird-core without an injector', () => {
  it('parses DEX and paints an event into a bare Scene', () => {
    // Registration is explicit — no import side effects, no DI (this is how
    // the workers wire core; the Angular app wires the same classes via tokens).
    initPieceFactories();

    const dex = DataExchange.fromDexObj(DEX_SAMPLE);
    expect(dex.events.length).toBe(1);
    expect(dex.events[0].pieces.length).toBe(2);

    const scene = new Scene();
    const painter = new DataModelPainter();
    registerDefaultPainters(painter);
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
