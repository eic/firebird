/**
 * EventDisplayService loading and lifecycle contracts, with the rendering
 * stack stubbed (no WebGPU in tests):
 *
 * - returning to a display page keeps a deep-linked, command-loaded or picked
 *   source on screen; the configured default loads only when the config
 *   changed or the data selector applied a choice;
 * - the latest REQUESTED events load wins, whatever finishes last, and the
 *   footer spinners follow the latest load;
 * - ThreeExtension.onEventLoaded fires once per load and once per switch;
 * - readiness (`window.firebird`) settles on every path, counts a loader's
 *   work from its start, and lists failures in `window.firebird.errors`;
 * - failures carry their reason to the one user-visible error channel.
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Group, PerspectiveCamera, Scene } from 'three';
import type { DataSource, EventDataLoader, GeometryDataLoader } from '@dexvis/firebird-core';
import { COMMAND_HANDLERS, CommandBusService, ConfigService, ServerConfigService } from '@dexvis/app-features';
import { EventDisplayService } from './event-display.service';
import { ThreeService } from './three.service';
import { GeometryService } from './geometry.service';
import { MessageService } from './message.service';
import { DataModelService } from './data-model.service';
import { DataSelectionService, SELECTION_CONFIG_KEYS } from './data-selection.service';
import { EVENT_LOADERS, GEOMETRY_LOADERS, PAINTERS } from '../firebird/tokens';
import { ROOT_COLLECTIONS_CONFIG, ROOT_EVENT_RANGE_CONFIG } from '../firebird/config-keys';
import { OpenDexCommandHandler, OpenGeometryCommandHandler } from '../firebird/builtin-command-handlers';

/** A promise with its resolve handle. */
interface Gate<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function gateOf<T>(): Gate<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

const deferred = (): Gate<void> => gateOf<void>();

/** Lets pending promise chains (fetch stubs, dynamic imports) run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

function dexDocument(eventIds: string[], version = '1.0'): unknown {
  return {
    type: 'firebird-dex-json',
    version,
    events: eventIds.map(id => ({ id, pieces: [] })),
  };
}

/** HTTP responses by URL; anything else is a 404. */
const responses = new Map<string, () => Response>();
const fetched: string[] = [];

function serveDex(url: string, eventIds: string[], version = '1.0'): void {
  responses.set(url, () => new Response(JSON.stringify(dexDocument(eventIds, version)), { status: 200 }));
}

/** GeometryService stand-in: resolves loads at once, or when the test says so. */
function geometryStub() {
  const stub = {
    loads: [] as Array<string | File>,
    gates: [] as Array<Gate<{ threeGeometry: Group | null }>>,
    gated: false,
    postProcessingGate: null as Gate<void> | null,
    loadGeometry: (source: string | File) => {
      stub.loads.push(source);
      if (!stub.gated) return Promise.resolve({ rootGeometry: null, threeGeometry: new Group() });
      const gate = gateOf<{ threeGeometry: Group | null }>();
      stub.gates.push(gate);
      return gate.promise.then(result => ({ rootGeometry: null, ...result }));
    },
    postProcessing: () => stub.postProcessingGate?.promise ?? Promise.resolve(),
  };
  return stub;
}

function threeStub() {
  return {
    sceneEvent: new Group(),
    sceneGeometry: new Group(),
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    renderer: {},
    clipPlanes: [],
    views: [],
    invalidate: vi.fn(),
    notifyEventLoaded: vi.fn(),
    geometryChanged: vi.fn(),
    clearHoverHighlight: vi.fn(),
    addFrameCallback: vi.fn(),
  };
}

const sourceName = (source: DataSource) => (typeof source === 'string' ? source : source.name);

/** A DEX loader like the built-in one: URLs fetch, files are read in place. */
class FakeDexLoader implements EventDataLoader {
  readonly meta = { id: 'fake-dex', label: 'fake DEX', fileExtensions: ['.firebird.json'] };
  canLoad(source: DataSource): boolean {
    return sourceName(source).endsWith('.firebird.json');
  }
  async loadEvents(source: DataSource) {
    const display = TestBed.inject(EventDisplayService);
    if (typeof source === 'string') return display.loadDexData(source);
    return display.runEventsLoad('dex', undefined, async request =>
      display.showDexDocument(JSON.parse(await source.text()), undefined, request));
  }
}

/**
 * A ROOT loader shaped like the in-browser converter: it starts its request
 * before converting, then shows the result through that request. A test can
 * hold a conversion open with `gates`.
 */
class FakeRootLoader implements EventDataLoader {
  readonly meta = { id: 'fake-root', label: 'fake ROOT', fileExtensions: ['.root'] };
  readonly calls: string[] = [];
  readonly gates = new Map<string, Gate<void>>();
  canLoad(source: DataSource): boolean {
    return sourceName(source).endsWith('.root');
  }
  async loadEvents(source: DataSource) {
    // The built-in loader resolves EventDisplayService through a dynamic import first
    await Promise.resolve();
    const config = TestBed.inject(ConfigService);
    const entries = config.declare(ROOT_EVENT_RANGE_CONFIG).value || ROOT_EVENT_RANGE_CONFIG.default;
    const collections = config.declare(ROOT_COLLECTIONS_CONFIG).value || '';
    const display = TestBed.inject(EventDisplayService);
    const name = sourceName(source);
    this.calls.push(name);
    const sourceId = typeof source === 'string' ? { url: source, entries, collections } : undefined;
    return display.runEventsLoad('root', sourceId, async request => {
      await this.gates.get(name)?.promise;
      return display.showDexDocument(dexDocument([`${name}#0`]), sourceId, request);
    });
  }
}

class FakeGeometryLoader implements GeometryDataLoader {
  readonly meta = { id: 'fake-geometry', label: 'fake geometry', fileExtensions: ['.geo.root'] };
  canLoad(): boolean {
    return true;
  }
  load(source: DataSource) {
    return TestBed.inject(EventDisplayService).loadGeometry(source);
  }
}

describe('EventDisplayService loading', () => {
  let display: EventDisplayService;
  let three: ReturnType<typeof threeStub>;
  let geometry: ReturnType<typeof geometryStub>;
  let messages: { addMessage: ReturnType<typeof vi.fn> };
  let rootLoader: FakeRootLoader;
  let config: ConfigService;
  let commandBus: CommandBusService;
  let selection: DataSelectionService;
  let data: DataModelService;
  let extraProviders: unknown[];

  const DEFAULT_GEOMETRY = 'https://h/default.geo.root';

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: ThreeService, useValue: three },
        { provide: GeometryService, useValue: geometry },
        { provide: MessageService, useValue: messages },
        { provide: EVENT_LOADERS, useClass: FakeDexLoader, multi: true },
        { provide: EVENT_LOADERS, useValue: rootLoader, multi: true },
        { provide: GEOMETRY_LOADERS, useClass: FakeGeometryLoader, multi: true },
        { provide: COMMAND_HANDLERS, useClass: OpenGeometryCommandHandler, multi: true },
        { provide: COMMAND_HANDLERS, useClass: OpenDexCommandHandler, multi: true },
        ...extraProviders as never[],
      ],
    });
    TestBed.inject(ServerConfigService).setUnitTestConfig({});
    config = TestBed.inject(ConfigService);
    config.getConfigOrCreate<string>(SELECTION_CONFIG_KEYS.geometry, '').value = DEFAULT_GEOMETRY;
    commandBus = TestBed.inject(CommandBusService);
    selection = TestBed.inject(DataSelectionService);
    data = TestBed.inject(DataModelService);
    display = TestBed.inject(EventDisplayService);
  }

  /** What the display shows: the id of the current entry. */
  const shownEntry = () => data.currentEntry()?.id;
  const firebird = () => {
    TestBed.tick();
    return window.firebird!;
  };

  beforeEach(() => {
    localStorage.clear();
    responses.clear();
    fetched.length = 0;
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = String(input);
      fetched.push(url);
      return responses.get(url)?.() ?? new Response('not here', { status: 404, statusText: 'Not Found' });
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    three = threeStub();
    geometry = geometryStub();
    messages = { addMessage: vi.fn() };
    rootLoader = new FakeRootLoader();
    extraProviders = [];
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('returning to a display page', () => {
    for (const source of ['url', 'server'] as const) {
      it(`keeps a geometry that a startup command (${source}) loaded`, async () => {
        create();
        commandBus.queueStartupCommands([{ type: 'open-geometry', url: 'https://h/deep.geo.root', source }]);
        display.autoLoadAndRunStartup();
        await settle();
        expect(geometry.loads).toEqual(['https://h/deep.geo.root']);

        // Configure, then back to the display: the startup queue is empty now
        display.autoLoadAndRunStartup();
        await settle();
        expect(geometry.loads).toEqual(['https://h/deep.geo.root']);
      });
    }

    it('keeps a picked geometry file, and loads a geometry the config page applied', async () => {
      create();
      const file = new File(['x'], 'mine.geo.root');
      selection.apply({ geometry: file });
      display.autoLoadAndRunStartup();
      await settle();
      expect(geometry.loads).toEqual([file]);

      display.autoLoadAndRunStartup();
      await settle();
      expect(geometry.loads).toEqual([file]);

      // The config page applies the configured default again: the user asked
      // for it, so the next mount loads it although the value did not change
      selection.apply({ geometry: DEFAULT_GEOMETRY });
      display.autoLoadAndRunStartup();
      await settle();
      expect(geometry.loads).toEqual([file, DEFAULT_GEOMETRY]);

      // ...and only once
      display.autoLoadAndRunStartup();
      await settle();
      expect(geometry.loads.length).toBe(2);
    });

    it('loads the configured geometry on a remount once the config changed', async () => {
      create();
      commandBus.queueStartupCommands([{ type: 'open-geometry', url: 'https://h/deep.geo.root', source: 'url' }]);
      display.autoLoadAndRunStartup();
      await settle();
      config.getConfig<string>(SELECTION_CONFIG_KEYS.geometry)!.value = 'https://h/other.geo.root';
      display.autoLoadAndRunStartup();
      await settle();
      expect(geometry.loads).toEqual(['https://h/deep.geo.root', 'https://h/other.geo.root']);
    });

    it('keeps deep-linked events over a persisted events source', async () => {
      create();
      serveDex('https://h/saved.firebird.json', ['saved']);
      serveDex('https://h/deep.firebird.json', ['deep']);
      config.getConfig<string>(SELECTION_CONFIG_KEYS.dexEvents)!.value = 'https://h/saved.firebird.json';
      commandBus.queueStartupCommands([{ type: 'open-dex', url: 'https://h/deep.firebird.json', source: 'url' }]);
      display.autoLoadAndRunStartup();
      await settle();
      expect(shownEntry()).toBe('deep');

      display.autoLoadAndRunStartup();
      await settle();
      expect(fetched).toEqual(['https://h/deep.firebird.json']);
      expect(shownEntry()).toBe('deep');
    });
  });

  describe('events load bookkeeping', () => {
    it('loads ROOT again after DEX replaced it (ROOT -> DEX -> ROOT)', async () => {
      create();
      selection.attachDisplay(parts => display.loadFromConfig(parts));
      serveDex('https://h/a.firebird.json', ['a']);

      selection.apply({ events: 'https://h/r.root', eventRange: '0' });
      await settle();
      expect(shownEntry()).toBe('https://h/r.root#0');

      selection.apply({ events: 'https://h/a.firebird.json' });
      await settle();
      expect(shownEntry()).toBe('a');

      selection.apply({ events: 'https://h/r.root', eventRange: '0' });
      await settle();
      expect(rootLoader.calls).toEqual(['https://h/r.root', 'https://h/r.root']);
      expect(shownEntry()).toBe('https://h/r.root#0');

      // The same source again is already on screen: no new conversion
      display.loadFromConfig({ events: true });
      await settle();
      expect(rootLoader.calls.length).toBe(2);
    });

    it('shows the last REQUESTED load, and the spinner follows it', async () => {
      create();
      selection.attachDisplay(parts => display.loadFromConfig(parts));
      serveDex('https://h/a.firebird.json', ['a']);
      const slow = deferred();
      rootLoader.gates.set('https://h/slow.root', slow);

      selection.apply({ events: 'https://h/slow.root', eventRange: '0' });
      await settle();
      expect(display.loadingEdm()).toBe(true);

      selection.apply({ events: 'https://h/a.firebird.json' });
      await settle();
      expect(shownEntry()).toBe('a');
      expect(display.loadingDex()).toBe(false);
      expect(display.loadingEdm()).toBe(false);

      // The older conversion finishes last and is not shown
      slow.resolve();
      await settle();
      expect(shownEntry()).toBe('a');
      expect(data.entries().map(entry => entry.id)).toEqual(['a']);
      expect(display.loadingEdm()).toBe(false);
    });
  });

  describe('ThreeExtension.onEventLoaded', () => {
    it('fires once per load and once per switch', async () => {
      create();
      serveDex('https://h/two.firebird.json', ['e0', 'e1']);

      await display.loadDexData('https://h/two.firebird.json');
      TestBed.tick();
      expect(three.notifyEventLoaded).toHaveBeenCalledTimes(1);
      expect(three.notifyEventLoaded.mock.calls[0][0].id).toBe('e0');

      data.setCurrentEntry(data.entries()[1]);
      TestBed.tick();
      TestBed.tick();
      expect(three.notifyEventLoaded).toHaveBeenCalledTimes(2);
      expect(three.notifyEventLoaded.mock.calls[1][0].id).toBe('e1');

      // Reloading the same file is a new load
      await display.loadDexData('https://h/two.firebird.json');
      TestBed.tick();
      expect(three.notifyEventLoaded).toHaveBeenCalledTimes(3);
      expect(three.notifyEventLoaded.mock.calls[2][0].id).toBe('e0');
    });
  });

  describe('readiness', () => {
    it('counts a config-driven ROOT conversion from the moment the loader starts', async () => {
      create();
      const gate = deferred();
      rootLoader.gates.set('https://h/r.root', gate);
      config.getConfig<string>(SELECTION_CONFIG_KEYS.rootEvents)!.value = 'https://h/r.root';
      config.getConfig<string>(SELECTION_CONFIG_KEYS.geometry)!.value = '';
      display.autoLoadAndRunStartup();
      // Startup ran no commands, and the loader has not reached its own code yet
      expect(firebird().startupCommandsDone).toBe(true);
      expect(firebird().pendingLoads).toBe(1);
      expect(firebird().ready).toBe(false);
      await settle();
      expect(firebird().startupCommandsDone).toBe(true);
      expect(firebird().ready).toBe(false);

      gate.resolve();
      await settle();
      expect(firebird().ready).toBe(true);
      expect(firebird().errors).toEqual([]);
    });

    it('settles after a superseded geometry load, in the worker or in post-processing', async () => {
      create();
      await display.runStartupCommands();
      geometry.gated = true;

      // Superseded while the worker loads: GeometryService answers 'cancelled'
      const first = display.loadGeometry('https://h/a.geo.root');
      const second = display.loadGeometry('https://h/b.geo.root');
      geometry.gates[0].resolve({ threeGeometry: null });
      expect(await first).toEqual({ root: null, cancelled: true });
      const geometryB = new Group();
      geometry.gates[1].resolve({ threeGeometry: geometryB });
      expect((await second).root).toBe(geometryB);
      expect(firebird().pendingLoads).toBe(0);
      expect(firebird().ready).toBe(true);

      // Superseded during post-processing: the older geometry stays out of the scene
      geometry.postProcessingGate = deferred();
      const third = display.loadGeometry('https://h/c.geo.root');
      const geometryC = new Group();
      geometry.gates[2].resolve({ threeGeometry: geometryC });
      await settle();
      const fourth = display.loadGeometry('https://h/d.geo.root');
      const geometryD = new Group();
      geometry.gates[3].resolve({ threeGeometry: geometryD });
      geometry.postProcessingGate.resolve();
      expect(await third).toEqual({ root: null, cancelled: true });
      expect((await fourth).root).toBe(geometryD);
      expect(geometryD.parent).toBe(three.sceneGeometry);
      expect(geometryC.parent).toBeNull();
      expect(display.loadingGeometry()).toBe(false);
      expect(firebird().ready).toBe(true);
    });

    it('keeps loading events when one lazy painter fails to load, and reports it', async () => {
      extraProviders = [{
        provide: PAINTERS,
        useValue: { forPieceType: 'BoxHit', load: () => Promise.reject(new Error('chunk 404')) },
        multi: true,
      }];
      create();
      serveDex('https://h/a.firebird.json', ['a']);
      await display.loadDexData('https://h/a.firebird.json');
      await display.loadDexData('https://h/a.firebird.json');
      expect(shownEntry()).toBe('a');
      expect(messages.addMessage).toHaveBeenCalledWith('error', expect.stringContaining("'BoxHit'"));
      expect(firebird().errors).toEqual([expect.stringContaining('chunk 404')]);
      expect(firebird().pendingLoads).toBe(0);
    });
  });

  describe('errors reach the user with their reason', () => {
    it('names the DEX upgrade command for an old file', async () => {
      create();
      serveDex('https://h/old.firebird.json', ['old'], '0.04');
      config.getConfig<string>(SELECTION_CONFIG_KEYS.dexEvents)!.value = 'https://h/old.firebird.json';
      display.autoLoadAndRunStartup();
      await settle();
      const reported = messages.addMessage.mock.calls.map(call => call[1] as string);
      expect(reported).toEqual([expect.stringMatching(/old\.firebird\.json.*0\.04.*pyrobird upgrade/)]);
      expect(firebird().errors).toEqual(reported);
      expect(firebird().ready).toBe(true);
    });

    it('reports a failed startup command with the HTTP status, and still settles', async () => {
      create();
      commandBus.queueStartupCommands([{ type: 'open-dex', url: 'https://h/missing.firebird.json', source: 'url' }]);
      display.autoLoadAndRunStartup();
      await settle();
      expect(firebird().errors).toEqual([
        "Startup command 'open-dex:https://h/missing.firebird.json' failed: " +
          'HTTP 404 Not Found (https://h/missing.firebird.json)',
      ]);
      expect(messages.addMessage).toHaveBeenCalledTimes(1);
      expect(firebird().ready).toBe(true);
    });
  });
});
