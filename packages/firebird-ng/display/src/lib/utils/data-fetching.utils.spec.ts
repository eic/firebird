import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { fetchTextFile, isDexZipMember, loadJSONFileEvents, loadZipFileEvents, readDexFile, readDexZip } from './data-fetching.utils';

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

describe('DEX zip members', () => {
  async function zipOf(members: Array<[string, string | null]>): Promise<Blob> {
    const zip = new JSZip();
    for (const [name, text] of members) {
      if (text === null) zip.folder(name);
      else zip.file(name, text);
    }
    return zip.generateAsync({ type: 'blob' });
  }

  it('accepts .json files only, outside __MACOSX and not dot-files', () => {
    expect(isDexZipMember('events.firebird.json')).toBe(true);
    expect(isDexZipMember('data/events.JSON')).toBe(true);
    expect(isDexZipMember('__MACOSX/._events.firebird.json')).toBe(false);
    expect(isDexZipMember('data/__MACOSX/events.json')).toBe(false);
    expect(isDexZipMember('._events.json')).toBe(false);
    expect(isDexZipMember('data/.hidden.json')).toBe(false);
    expect(isDexZipMember('folder.json/')).toBe(false);
    expect(isDexZipMember('readme.txt')).toBe(false);
  });

  it('skips the macOS metadata members that break JSON parsing', async () => {
    const blob = await zipOf([
      ['__MACOSX/', null],
      ['__MACOSX/._events.firebird.json', '\u0000\u0005binary resource fork'],
      ['.DS_Store', 'junk'],
      ['events.firebird.json', JSON.stringify(DEX)],
    ]);
    expect(await readDexZip(blob, 'mac.zip')).toEqual(DEX);
  });

  it('reads only the first DEX member, in archive order (pyrobird reads the same one)', async () => {
    const second = { ...DEX, events: [{ id: 'event_9', pieces: [] }] };
    const blob = await zipOf([
      ['notes.txt', 'hello'],
      ['first.firebird.json', JSON.stringify(DEX)],
      ['second.firebird.json', JSON.stringify(second)],
    ]);
    expect(await readDexZip(blob, 'two.zip')).toEqual(DEX);
  });

  it('inflates nothing but the chosen member', async () => {
    const blob = await zipOf([
      ['broken.txt', 'not json at all'],
      ['events.firebird.json', JSON.stringify(DEX)],
    ]);
    const archive = await JSZip.loadAsync(blob);
    const inflated: string[] = [];
    for (const file of Object.values(archive.files)) {
      const original = file.async.bind(file);
      (file as unknown as { async: unknown }).async = ((type: 'string') => {
        inflated.push(file.name);
        return original(type);
      }) as never;
    }
    const loadAsync = vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(archive);
    expect(await readDexZip(blob, 'events.zip')).toEqual(DEX);
    expect(inflated).toEqual(['events.firebird.json']);
    loadAsync.mockRestore();
  });

  it('says so when no member holds DEX', async () => {
    const blob = await zipOf([['__MACOSX/._events.json', 'x'], ['readme.txt', 'x']]);
    await expect(readDexZip(blob, 'empty.zip')).rejects.toThrow("'empty.zip' holds no .json member");
  });
});

describe('fetching', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects a failed binary fetch with the HTTP status instead of unzipping the error page', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>gone</html>', { status: 404, statusText: 'Not Found' }));
    await expect(loadZipFileEvents('https://h/e.firebird.zip'))
      .rejects.toThrow('HTTP 404 Not Found (https://h/e.firebird.zip)');
  });

  it("carries the server's JSON error message", async () => {
    vi.stubGlobal('fetch', async () => new Response(
      JSON.stringify({ error: 'Event 50-60 is out of range: the file holds 2 events (0..1)' }),
      { status: 400, statusText: 'BAD REQUEST' }));
    await expect(fetchTextFile('https://h/api/v1/convert/auto/50-60?f=x.root'))
      .rejects.toThrow('HTTP 400 BAD REQUEST: Event 50-60 is out of range: the file holds 2 events (0..1)');
  });
});

describe('HTML answers for missing files', () => {
  afterEach(() => vi.unstubAllGlobals());
  const indexPage = '<!doctype html><html><body>app</body></html>';

  it('says that a JSON request got an HTML page', async () => {
    vi.stubGlobal('fetch', async () => new Response(indexPage, { status: 200 }));
    await expect(loadJSONFileEvents('assets/data/missing.firebird.json'))
      .rejects.toThrow("'assets/data/missing.firebird.json' is not JSON (the server sent an HTML page instead; the file is probably missing)");
  });

  it('says that a zip request got an HTML page', async () => {
    vi.stubGlobal('fetch', async () => new Response(indexPage, { status: 200 }));
    await expect(loadZipFileEvents('assets/data/missing.firebird.zip'))
      .rejects.toThrow("'assets/data/missing.firebird.zip' is not a readable zip archive (the server sent an HTML page instead");
  });
});
