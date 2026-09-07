/**
 * The parity contract: for the same ROOT file and the same entries, this
 * package must produce the DEX document pyrobird produces - not approximately,
 * value for value. Both sides read the same IEEE754 bytes out of the file and
 * do the same arithmetic on them, so every number matches exactly.
 *
 * The reference documents in ../test-data were written by `pyrobird convert`;
 * see the README there for how to regenerate them. The ROOT inputs are
 * pyrobird's own test files - the same bytes both implementations read.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertRootToDex } from './convert';
import type { DexDocument } from './dex';

const REPO = resolve(__dirname, '../../..');
const ROOT_DATA = resolve(REPO, 'pyrobird/tests/unit_tests/data');
const REFERENCE = resolve(__dirname, '../test-data');

const CASES = [
  {
    label: 'edm4eic (eicrecon reconstruction)',
    root: 'reco_2024-09_craterlake_2evt.edm4eic.root',
    reference: 'reco_2024-09_craterlake_2evt.pyrobird.json',
    model: 'edm4eic',
  },
  {
    label: 'edm4hep (ddsim simulation)',
    root: 'k_lambda_10x100_2evt.edm4hep.root',
    reference: 'k_lambda_10x100_2evt.pyrobird.json',
    model: 'edm4hep',
  },
] as const;

describe('root2dex / pyrobird parity', () => {
  for (const testCase of CASES) {
    const rootPath = resolve(ROOT_DATA, testCase.root);
    const referencePath = resolve(REFERENCE, testCase.reference);
    const available = existsSync(rootPath) && existsSync(referencePath);

    it.runIf(available)(`converts ${testCase.label} exactly like pyrobird`, async () => {
      const expected = JSON.parse(readFileSync(referencePath, 'utf8')) as DexDocument;
      // The JSON round trip drops undefined optional fields the same way
      // writing the document to a file would
      const actual = JSON.parse(
        JSON.stringify(await convertRootToDex(rootPath, '0-1')),
      ) as DexDocument;

      expect(actual.type).toBe(expected.type);
      expect(actual.version).toBe(expected.version);

      // origin.file is the path each side was invoked with, so only the parts
      // derived from the file itself are compared
      const origin = actual.origin as Record<string, unknown>;
      const expectedOrigin = expected.origin as Record<string, unknown>;
      expect(origin['entries_count']).toBe(expectedOrigin['entries_count']);
      expect(origin['file_type']).toBe(testCase.model);
      expect(expectedOrigin['file_type']).toBe(testCase.model);

      expect(actual.events.length).toBe(expected.events.length);
      actual.events.forEach((event, e) => {
        const expectedEvent = expected.events[e];
        expect(event.id, `events[${e}].id`).toBe(expectedEvent.id);
        // Piece names first: a mismatch here reads far better than a diff of
        // two thousand-element column arrays
        expect(
          event.pieces.map(piece => `${piece.name}:${piece.type}:${piece.count}`),
          `events[${e}] pieces`,
        ).toEqual(expectedEvent.pieces.map(piece => `${piece.name}:${piece.type}:${piece.count}`));
        event.pieces.forEach((piece, p) => {
          expect(piece, `events[${e}].pieces[${p}] (${piece.name})`).toEqual(
            expectedEvent.pieces[p],
          );
        });
      });
    });
  }
});
