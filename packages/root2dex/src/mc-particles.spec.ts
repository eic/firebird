/**
 * Unit tests for the MCParticles straight-line interpolation. The full
 * conversion (and its pyrobird parity) is covered by parity.spec.ts; these pin
 * the grid arithmetic on its own.
 */

import { describe, expect, it } from 'vitest';
import { C_LIGHT, interpolateLinePoints } from './mc-particles';

describe('interpolateLinePoints', () => {
  it('places interior points on the fixed time grid', () => {
    // beta=1 over 3 x c_light mm takes 3 ns; step 1 ns => vertex + 2 interior + endpoint
    const points = interpolateLinePoints(0, 0, 0, 3 * C_LIGHT, 0, 0, 10.0, 1.0, 1.0);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual([0, 0, 0, 10.0]);
    expect(points[3][0]).toBe(3 * C_LIGHT);
    expect(points[3][3]).toBeCloseTo(13.0, 12);
    expect(points[1][3]).toBeCloseTo(11.0, 12);
    expect(points[2][3]).toBeCloseTo(12.0, 12);
    expect(points[1][0]).toBeCloseTo(C_LIGHT, 9);
  });

  it('coarsens the grid instead of truncating when maxPoints is hit', () => {
    const points = interpolateLinePoints(0, 0, 0, 100000, 0, 0, 0.0, 1.0, 0.001, 16);
    expect(points).toHaveLength(16);
    expect(points[15][0]).toBe(100000);
    const steps = points.slice(1).map((point, i) => point[3] - points[i][3]);
    for (const step of steps) expect(step).toBeCloseTo(steps[0], 12);
  });

  it('yields two equal-time end points for a particle at rest', () => {
    expect(interpolateLinePoints(1, 2, 3, 1, 2, 3, 5.0, 0.0)).toEqual([
      [1, 2, 3, 5.0],
      [1, 2, 3, 5.0],
    ]);
  });
});
