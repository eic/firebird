import { describe, expect, it } from 'vitest';
import { matchesFileExtensions, type DataLoaderMeta } from './loaders';

const DEX_META: DataLoaderMeta = {
  id: 'test-dex',
  label: 'Test DEX',
  fileExtensions: ['.firebird.json', '.firebird.zip', '.zip'],
  urlSchemes: ['asset://'],
};

describe('matchesFileExtensions', () => {
  it('matches by path extension', () => {
    expect(matchesFileExtensions('events.firebird.zip', DEX_META)).toBe(true);
    expect(matchesFileExtensions('https://host/d/events.firebird.zip?token=abc', DEX_META)).toBe(true);
    expect(matchesFileExtensions('detector.root', DEX_META)).toBe(false);
  });

  it('matches by scheme only a name without a file extension', () => {
    expect(matchesFileExtensions('asset://data/example', DEX_META)).toBe(true);
    expect(matchesFileExtensions('asset://data/example.firebird.zip', DEX_META)).toBe(true);
    // A known non-matching extension wins over the scheme
    expect(matchesFileExtensions('asset://data/example.whatever', DEX_META)).toBe(false);
    expect(matchesFileExtensions('asset://data/events.edm4eic.root', DEX_META)).toBe(false);
  });

  it('does not take the host of a URL for a file extension', () => {
    const xrootd: DataLoaderMeta = { id: 'xrootd', label: 'XRootD', fileExtensions: ['.root'], urlSchemes: ['root://'] };
    expect(matchesFileExtensions('root://dtn-eic.jlab.org', xrootd)).toBe(true);
    expect(matchesFileExtensions('root://dtn-eic.jlab.org//work/run', xrootd)).toBe(true);
    expect(matchesFileExtensions('root://dtn-eic.jlab.org//work/run.root', xrootd)).toBe(true);
    expect(matchesFileExtensions('root://dtn-eic.jlab.org//work/run.firebird.zip', xrootd)).toBe(false);
  });

  it('matches a picked file by its name', () => {
    expect(matchesFileExtensions(new File([], 'dropped.firebird.zip'), DEX_META)).toBe(true);
  });

  it('matches download-style URLs carrying the file name in a query parameter', () => {
    expect(matchesFileExtensions(
      'http://localhost:5454/api/v1/download?f=events.firebird.zip', DEX_META)).toBe(true);
    expect(matchesFileExtensions(
      'http://localhost:5454/api/v1/download?filename=dir%2Fevents.firebird.zip', DEX_META)).toBe(true);
    expect(matchesFileExtensions(
      'http://localhost:5454/api/v1/download?f=file.root', DEX_META)).toBe(false);
    // Malformed percent-encoding must not throw
    expect(matchesFileExtensions('http://host/x?f=%E0%A4%A', DEX_META)).toBe(false);
  });
});
