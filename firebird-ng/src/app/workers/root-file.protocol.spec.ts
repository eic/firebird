/**
 * The ROOT file worker's request handling: files open under handles, so one
 * client opening a file never replaces the file another client converts, and
 * entry selections are checked before they are expanded.
 */

import { describe, expect, it } from 'vitest';
import type { DexDocument, PodioModel } from '@dexvis/root2dex';
import {
  RootFileSession,
  type OpenedConverter,
  type RootFileRequest,
  type RootFileResponse,
} from './root-file.protocol';

/** A converter that names its file in every converted event. */
function fakeConverter(name: string, entryCount: number): OpenedConverter {
  return {
    sourceName: name,
    model: 'edm4eic' as PodioModel,
    entryCount,
    async convert(entries) {
      return { events: entries.map(entry => ({ id: `${name}#${entry}` })) } as unknown as DexDocument;
    },
  };
}

/** A request without its id (the helper numbers them). */
type Unsent<T> = T extends unknown ? Omit<T, 'requestId'> : never;

function setup() {
  const posted: RootFileResponse[] = [];
  const gates = new Map<string, Promise<void>>();
  const session = new RootFileSession(
    {
      listKeys: async () => [{ name: 'events', className: 'TTree' }],
      open: async source => {
        const name = typeof source === 'string' ? source : source.name;
        await gates.get(name);
        return fakeConverter(name, 3);
      },
      collectionGroups: () => ['tracker_hits'],
    },
    message => posted.push(message),
  );
  let counter = 0;
  const send = async (request: Unsent<RootFileRequest>): Promise<RootFileResponse> => {
    const requestId = `r${++counter}`;
    await session.handle({ ...request, requestId } as RootFileRequest);
    return posted.find(message => message.requestId === requestId)!;
  };
  const url = (name: string) => ({ kind: 'url' as const, url: name });
  const convertedIds = (response: RootFileResponse) =>
    response.type === 'converted'
      ? (response.dex as unknown as { events: Array<{ id: string }> }).events.map(event => event.id)
      : response;
  return { session, send, url, gates, convertedIds };
}

describe('RootFileSession', () => {
  it('keeps one open file per handle: open(A), open(B), convert(A) converts A', async () => {
    const { send, url, convertedIds } = setup();
    await send({ type: 'open', handle: 1, source: url('A') });
    await send({ type: 'open', handle: 2, source: url('B') });
    expect(convertedIds(await send({ type: 'convert', handle: 1, entries: '0' }))).toEqual(['A#0']);
    expect(convertedIds(await send({ type: 'convert', handle: 2, entries: '1' }))).toEqual(['B#1']);
  });

  it('keeps the latest open of a handle when an older one finishes later', async () => {
    const { send, url, gates, convertedIds } = setup();
    let releaseSlow!: () => void;
    gates.set('slow', new Promise<void>(resolve => { releaseSlow = resolve; }));
    const slowOpen = send({ type: 'open', handle: 1, source: url('slow') });
    await send({ type: 'open', handle: 1, source: url('fast') });
    releaseSlow();
    await slowOpen;
    expect(convertedIds(await send({ type: 'convert', handle: 1, entries: '0' }))).toEqual(['fast#0']);
  });

  it('closes one handle and leaves the others open', async () => {
    const { send, url, convertedIds } = setup();
    await send({ type: 'open', handle: 1, source: url('A') });
    await send({ type: 'open', handle: 2, source: url('B') });
    expect((await send({ type: 'close', handle: 1 })).type).toBe('closed');
    expect(await send({ type: 'convert', handle: 1, entries: '0' }))
      .toEqual(expect.objectContaining({ type: 'error', error: 'No ROOT file is open' }));
    expect(convertedIds(await send({ type: 'convert', handle: 2, entries: '0' }))).toEqual(['B#0']);
  });

  it('rejects selections outside the file or too large, with the messages pyrobird uses', async () => {
    const { send, url } = setup();
    await send({ type: 'open', handle: 1, source: url('A') });
    expect(await send({ type: 'convert', handle: 1, entries: '0-5' })).toEqual(expect.objectContaining({
      type: 'error',
      error: 'Event 3-5 is out of range: the file holds 3 events (0..2)',
    }));
    expect(await send({ type: 'convert', handle: 1, entries: '0-20000000' })).toEqual(expect.objectContaining({
      type: 'error',
      error: 'The selection names 20000001 entries; at most 1000 are allowed per request.',
    }));
  });

  it('probes without a handle', async () => {
    const { send, url } = setup();
    expect(await send({ type: 'probe', source: url('A') })).toEqual(expect.objectContaining({
      type: 'probed',
      probe: { name: 'A', entries: [{ name: 'events', className: 'TTree' }] },
    }));
  });
});
