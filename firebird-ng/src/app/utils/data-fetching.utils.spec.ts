import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { readDexFile } from './data-fetching.utils';

const DEX = {
  type: 'firebird-dex-json',
  version: '1.0',
  events: [{ id: 'event_0', pieces: [] }],
};

describe('readDexFile', () => {
  it('reads a plain .firebird.json file', async () => {
    const file = new File([JSON.stringify(DEX)], 'events.firebird.json');
    expect(await readDexFile(file)).toEqual(DEX);
  });

  it('reads the .json member of a dropped .zip', async () => {
    const zip = new JSZip();
    zip.file('events.firebird.json', JSON.stringify(DEX));
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'events.firebird.zip');
    expect(await readDexFile(file)).toEqual(DEX);
  });

  it('throws on a file that is not JSON', async () => {
    const file = new File(['not json'], 'notes.json');
    await expect(readDexFile(file)).rejects.toThrow();
  });
});
