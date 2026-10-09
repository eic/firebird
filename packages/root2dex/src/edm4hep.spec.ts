/**
 * Which sim hit collections feed the MC-truth trajectories. The converter is
 * experiment-neutral: it excludes nothing unless the caller names
 * collections in `trajectoryExcludedCollections`.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Root2DexConverter, type ConvertOptions } from './convert';
import { EDM4HEP_SIM_HIT_TYPE } from './edm4hep';

const SIM_FILE = resolve(__dirname, '../../../pyrobird/tests/unit_tests/data/k_lambda_10x100_2evt.edm4hep.root');

describe('edm4hep trajectory sources', () => {
  it.runIf(existsSync(SIM_FILE))('joins every sim hit collection unless told to exclude some', async () => {
    const converter = await Root2DexConverter.open(SIM_FILE);
    const hitCollections = converter.file.collectionsOfType(EDM4HEP_SIM_HIT_TYPE);
    expect(hitCollections.length).toBeGreaterThan(1);

    /** The collections the trajectory piece of entry 0 was built from. */
    const trajectorySources = async (options: ConvertOptions) => {
      const event = await converter.convertEntry(0, { ...options, collections: ['mc_trajectories'] });
      const trajectories = event.pieces.find(piece => piece.type === 'PointTrajectory');
      return (trajectories?.origin as { collections: string[] }).collections;
    };

    expect(await trajectorySources({})).toEqual(hitCollections);
    const [excluded, ...kept] = hitCollections;
    expect(await trajectorySources({ trajectoryExcludedCollections: [excluded] })).toEqual(kept);
  });
});
