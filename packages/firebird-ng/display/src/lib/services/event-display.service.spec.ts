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
 * - failures carry their reason to the one user-visible error channel;
 * - the first REGISTERED painter of a piece type is its default;
 * - the collision intro plays on the event layer and leaves no tween behind.
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Group, Mesh, Object3D, PerspectiveCamera, Scene } from 'three';
import {
  DataExchange,
  type DataSource,
  type EventDataLoader,
  type GeometryDataLoader,
  type LoaderContext,
  type PiecePainterConstructor,
} from '@dexvis/firebird-core';
import { COMMAND_HANDLERS, CommandBusService, ConfigService, ServerConfigService } from '@dexvis/app-features';
import { EventDisplayService } from './event-display.service';
import { ThreeService } from './three.service';
import { GeometryService } from './geometry.service';
import { MessageService } from './message.service';
import { DataModelService } from './data-model.service';
import {
  COLLISION_INTRO,
  CollisionIntro,
  DataSelectionService,
  EVENT_DATA_LAYER,
  EVENT_LOADERS,
  GEOMETRY_LOADERS,
  PAINTERS,
  ROOT_COLLECTIONS_CONFIG,
  ROOT_EVENT_RANGE_CONFIG,
  SELECTION_CONFIG_KEYS,
} from '@dexvis/firebird-ng/api';
import {
  AnimateCollisionCommandHandler,
  OpenDexCommandHandler,
  OpenGeometryCommandHandler,
} from '@dexvis/firebird-ng';

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
    /** Gated loads: resolve with a geometry, or null for a load a newer one replaced. */
    gates: [] as Array<Gate<Group | null>>,
    gated: false,
    postProcessingGate: null as Gate<void> | null,
    geometry: { set: vi.fn() },
    loadGeometry: (source: string | File): Promise<Group> => {
      stub.loads.push(source);
      if (!stub.gated) return Promise.resolve(new Group());
      const gate = gateOf<Group | null>();
      stub.gates.push(gate);
      return gate.promise.then(result => result ?? Promise.reject(new DOMException('replaced', 'AbortError')));
    },
    postProcessing: () => stub.postProcessingGate?.promise ?? Promise.resolve(),
    geometryFastAndUgly: { value: false },
  };
  return stub;
}

function threeStub() {
  const sceneEvent = new Group();
  return {
    init: vi.fn(async () => true),
    detach: vi.fn(),
    setSize: vi.fn(),
    sceneEvent,
    // Like ThreeService.addEventObject: under sceneEvent, on the event layer
    addEventObject: vi.fn((object: Object3D) => {
      sceneEvent.add(object);
      object.traverse(node => node.layers.set(EVENT_DATA_LAYER));
    }),
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
  async loadEvents(source: DataSource, context: LoaderContext) {
    const data = TestBed.inject(DataModelService);
    if (typeof source !== 'string') return data.readDexFile(source);
    return data.fetchDex(context.resolveUrl(source), { name: source, signal: context.signal });
  }
}

/**
 * A ROOT loader shaped like the in-browser converter: it reads its options
 * from config and converts. A test can hold a conversion open with `gates`.
 */
class FakeRootLoader implements EventDataLoader {
  readonly meta = { id: 'fake-root', label: 'fake ROOT', fileExtensions: ['.root'] };
  readonly calls: string[] = [];
  readonly gates = new Map<string, Gate<void>>();
  canLoad(source: DataSource): boolean {
    return sourceName(source).endsWith('.root');
  }
  async loadEvents(source: DataSource) {
    // The built-in loader loads the display entry through a dynamic import first
    await Promise.resolve();
    const name = sourceName(source);
    this.calls.push(name);
    await this.gates.get(name)?.promise;
    return DataExchange.fromDexObj(dexDocument([`${name}#0`]));
  }
}

/** A ROOT geometry loader like the built-in one, over the GeometryService stand-in. */
class FakeGeometryLoader implements GeometryDataLoader {
  readonly meta = { id: 'fake-geometry', label: 'fake geometry', fileExtensions: ['.geo.root'] };
  readonly millimetersPerUnit = 10;
  canLoad(source: DataSource): boolean {
    return sourceName(source).endsWith('.geo.root');
  }
  load(source: DataSource, context: LoaderContext) {
    return TestBed.inject(GeometryService).loadGeometry(source, { signal: context.signal });
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

  /** The host element the display attaches to, and the disposer of the attachment. */
  let host: HTMLElement;
  let detachDisplay: (() => void) | null;

  /**
   * Puts the display on a page, as `<firebird-display>` does: a page visit.
   * A second call is a return to the page: the previous visit detaches first.
   */
  async function visitDisplay(): Promise<void> {
    detachDisplay?.();
    detachDisplay = display.attach(host);
    // attach() loads once the renderer initialized
    await settle();
  }

  /** What the display shows: the id of the current entry. */
  const shownEntry = () => data.currentEntry()?.id;
  const firebird = () => {
    TestBed.tick();
    return window.firebird!;
  };

  // The command handlers reach the display through a dynamic import of the
  // display entry; loading it once here lets their import resolve within settle()
  beforeAll(async () => {
    await import('@dexvis/firebird-ng/display');
  });

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
    host = document.createElement('div');
    detachDisplay = null;
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
        await visitDisplay();
        await settle();
        expect(geometry.loads).toEqual(['https://h/deep.geo.root']);

        // Configure, then back to the display: the startup queue is empty now
        await visitDisplay();
        await settle();
        expect(geometry.loads).toEqual(['https://h/deep.geo.root']);
      });
    }

    it('keeps a picked geometry file, and loads a geometry the config page applied', async () => {
      create();
      const file = new File(['x'], 'mine.geo.root');
      selection.apply({ geometry: file });
      await visitDisplay();
      await settle();
      expect(geometry.loads).toEqual([file]);

      await visitDisplay();
      await settle();
      expect(geometry.loads).toEqual([file]);

      // The config page applies the configured default again: the user asked
      // for it, so the next mount loads it although the value did not change
      selection.apply({ geometry: DEFAULT_GEOMETRY });
      await visitDisplay();
      await settle();
      expect(geometry.loads).toEqual([file, DEFAULT_GEOMETRY]);

      // ...and only once
      await visitDisplay();
      await settle();
      expect(geometry.loads.length).toBe(2);
    });

    it('loads the configured geometry on a remount once the config changed', async () => {
      create();
      commandBus.queueStartupCommands([{ type: 'open-geometry', url: 'https://h/deep.geo.root', source: 'url' }]);
      await visitDisplay();
      await settle();
      config.getConfig<string>(SELECTION_CONFIG_KEYS.geometry)!.value = 'https://h/other.geo.root';
      await visitDisplay();
      await settle();
      expect(geometry.loads).toEqual(['https://h/deep.geo.root', 'https://h/other.geo.root']);
    });

    it('keeps deep-linked events over a persisted events source', async () => {
      create();
      serveDex('https://h/saved.firebird.json', ['saved']);
      serveDex('https://h/deep.firebird.json', ['deep']);
      config.getConfig<string>(SELECTION_CONFIG_KEYS.dexEvents)!.value = 'https://h/saved.firebird.json';
      commandBus.queueStartupCommands([{ type: 'open-dex', url: 'https://h/deep.firebird.json', source: 'url' }]);
      await visitDisplay();
      await settle();
      expect(shownEntry()).toBe('deep');

      await visitDisplay();
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

      await display.openEvents('https://h/two.firebird.json');
      TestBed.tick();
      expect(three.notifyEventLoaded).toHaveBeenCalledTimes(1);
      expect(three.notifyEventLoaded.mock.calls[0][0].id).toBe('e0');

      data.setCurrentEntry(data.entries()[1]);
      TestBed.tick();
      TestBed.tick();
      expect(three.notifyEventLoaded).toHaveBeenCalledTimes(2);
      expect(three.notifyEventLoaded.mock.calls[1][0].id).toBe('e1');

      // Reloading the same file is a new load
      await display.openEvents('https://h/two.firebird.json');
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
      await visitDisplay();
      // Startup ran no commands; the held conversion keeps readiness back
      expect(firebird().startupCommandsDone).toBe(true);
      expect(firebird().pendingLoads).toBe(1);
      expect(firebird().ready).toBe(false);

      gate.resolve();
      await settle();
      expect(firebird().ready).toBe(true);
      expect(firebird().errors).toEqual([]);
    });

    it('settles after a superseded geometry load, in the worker or in post-processing', async () => {
      create();
      await commandBus.runStartupCommands();
      geometry.gated = true;

      // Superseded while the worker loads: the older loader rejects with its abort
      const first = display.openGeometry('https://h/a.geo.root');
      const second = display.openGeometry('https://h/b.geo.root');
      geometry.gates[0].resolve(null);
      expect(await first).toBeNull();
      const geometryB = new Group();
      geometry.gates[1].resolve(geometryB);
      expect(await second).toBe(geometryB);
      expect(three.sceneGeometry.scale.x).toBe(10);
      expect(firebird().pendingLoads).toBe(0);
      expect(firebird().ready).toBe(true);

      // Superseded during post-processing: the older geometry stays out of the scene
      geometry.postProcessingGate = deferred();
      const third = display.openGeometry('https://h/c.geo.root');
      const geometryC = new Group();
      geometry.gates[2].resolve(geometryC);
      await settle();
      const fourth = display.openGeometry('https://h/d.geo.root');
      const geometryD = new Group();
      geometry.gates[3].resolve(geometryD);
      geometry.postProcessingGate.resolve();
      expect(await third).toBeNull();
      expect(await fourth).toBe(geometryD);
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
      await display.openEvents('https://h/a.firebird.json');
      await display.openEvents('https://h/a.firebird.json');
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
      await visitDisplay();
      await settle();
      const reported = messages.addMessage.mock.calls.map(call => call[1] as string);
      expect(reported).toEqual([expect.stringMatching(/old\.firebird\.json.*0\.04.*pyrobird upgrade/)]);
      expect(firebird().errors).toEqual(reported);
      expect(firebird().ready).toBe(true);
    });

    it('reports a failed startup command with the HTTP status, and still settles', async () => {
      create();
      commandBus.queueStartupCommands([{ type: 'open-dex', url: 'https://h/missing.firebird.json', source: 'url' }]);
      await visitDisplay();
      await settle();
      expect(firebird().errors).toEqual([
        "Startup command 'open-dex:https://h/missing.firebird.json' failed: " +
          'HTTP 404 Not Found (https://h/missing.firebird.json)',
      ]);
      expect(messages.addMessage).toHaveBeenCalledTimes(1);
      expect(firebird().ready).toBe(true);
    });
  });
  describe('the loader contract', () => {
    /**
     * A loader that records what the display hands it, answers when the test
     * says so, and rejects with the signal's reason when the load is aborted.
     */
    class StubLoader implements GeometryDataLoader, EventDataLoader {
      readonly meta;
      constructor(id = 'stub') {
        this.meta = { id, label: 'stub format', fileExtensions: ['.stub'] };
      }
      readonly calls: Array<{ source: DataSource; context: LoaderContext }> = [];
      readonly answers: Array<(value: never) => void> = [];
      readonly failures: Array<(error: Error) => void> = [];
      canLoad(source: DataSource): boolean {
        return sourceName(source).endsWith('.stub');
      }
      load(source: DataSource, context: LoaderContext): Promise<Object3D> {
        return this.answerLater(source, context);
      }
      loadEvents(source: DataSource, context: LoaderContext): Promise<DataExchange> {
        return this.answerLater(source, context);
      }
      private answerLater<T>(source: DataSource, context: LoaderContext): Promise<T> {
        this.calls.push({ source, context });
        return new Promise<T>((resolve, reject) => {
          this.answers.push(resolve as (value: never) => void);
          this.failures.push(reject);
          context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
        });
      }
    }

    let stub: StubLoader;
    const reported = () => messages.addMessage.mock.calls.map(call => call[1] as string);

    beforeEach(() => {
      stub = new StubLoader();
      extraProviders = [
        { provide: GEOMETRY_LOADERS, useValue: stub, multi: true },
        { provide: EVENT_LOADERS, useValue: stub, multi: true },
      ];
    });

    it('loads the configured geometry through the claiming loader and shows what it returns', async () => {
      create();
      config.getConfig<string>(SELECTION_CONFIG_KEYS.geometry)!.value = 'asset://g/detector.stub';
      await visitDisplay();
      expect(stub.calls.map(call => call.source)).toEqual(['asset://g/detector.stub']);
      const { context } = stub.calls[0];
      expect(context.resolveUrl('asset://g/detector.stub')).toMatch(/\/assets\/g\/detector\.stub$/);
      expect(context.signal.aborted).toBe(false);

      const root = new Group();
      stub.answers[0](root as never);
      await settle();
      expect(root.parent).toBe(three.sceneGeometry);
      // No millimetersPerUnit: the loader's unit is the millimeter
      expect(three.sceneGeometry.scale.x).toBe(1);
      expect(geometry.geometry.set).toHaveBeenCalledWith(root);
      expect(three.geometryChanged).toHaveBeenCalledTimes(1);
      expect(firebird().ready).toBe(true);
    });

    it('aborts the older load when a newer one starts; the older ends without an error', async () => {
      create();
      const older = display.openEvents('https://h/a.stub');
      const newer = display.openEvents('https://h/b.stub');
      expect(stub.calls[0].context.signal.aborted).toBe(true);
      expect(stub.calls[1].context.signal.aborted).toBe(false);
      expect(await older).toBeNull();

      stub.answers[1](DataExchange.fromDexObj(dexDocument(['b'])) as never);
      expect((await newer)?.events.map(event => event.id)).toEqual(['b']);
      expect(shownEntry()).toBe('b');
      expect(reported()).toEqual([]);
    });

    it('names the formats the loaders know when none claims the source', async () => {
      create();
      config.getConfig<string>(SELECTION_CONFIG_KEYS.geometry)!.value = 'https://h/detector.iges';
      await visitDisplay();
      expect(reported()).toEqual([expect.stringContaining(
        "No geometry loader claims 'https://h/detector.iges'. Known formats: fake geometry (.geo.root); stub format (.stub)")]);
      await expect(display.openEvents('https://h/e.iges')).rejects.toThrow("No event loader claims 'https://h/e.iges'");
    });

    it("reports a loader's failure with its reason", async () => {
      create();
      config.getConfig<string>(SELECTION_CONFIG_KEYS.geometry)!.value = '';
      config.getConfig<string>(SELECTION_CONFIG_KEYS.dexEvents)!.value = 'https://h/e.stub';
      await visitDisplay();
      stub.failures[0](new Error('HTTP 403 Forbidden (https://h/e.stub)'));
      await settle();
      expect(reported()).toEqual(["Could not load events from 'https://h/e.stub': HTTP 403 Forbidden (https://h/e.stub)"]);
      expect(firebird().errors).toEqual(reported());
      expect(firebird().ready).toBe(true);
    });

    it('asks the loaders in registration order: the first claimant loads', async () => {
      // Another id: the same id would replace the first loader in place
      const late = new StubLoader('late-stub');
      extraProviders.push({ provide: EVENT_LOADERS, useValue: late, multi: true });
      create();
      void display.openEvents('https://h/e.stub');
      expect(stub.calls).toHaveLength(1);
      expect(late.calls).toHaveLength(0);
    });

    it('loads a picked file through the claiming loader, in place', async () => {
      create();
      const file = new File(['x'], 'events.stub');
      selection.apply({ events: file });
      await visitDisplay();
      expect(stub.calls.map(call => call.source)).toEqual([file]);
    });
  });

  describe('painter registration', () => {
    /** A painter class as the registry sees it: a constructor with static meta. */
    const painterClass = (id: string) =>
      ({ [id]: class { static meta = { id, forPieceTypes: ['spec.Piece'] }; } })[id] as unknown as PiecePainterConstructor;

    it('makes the first registered painter the default, whichever chunk resolves first', async () => {
      const first = painterClass('first');
      const second = painterClass('second');
      const slowChunk = gateOf<PiecePainterConstructor>();
      extraProviders = [
        { provide: PAINTERS, useValue: { forPieceType: 'spec.Piece', load: () => slowChunk.promise }, multi: true },
        { provide: PAINTERS, useValue: { forPieceType: 'spec.Piece', load: () => Promise.resolve(second) }, multi: true },
      ];
      create();
      await settle();
      slowChunk.resolve(first);
      await settle();
      expect(display.paintersForType('spec.Piece')).toEqual([first, second]);
    });

    it('a later painter with the same meta id replaces the earlier one in place', async () => {
      const original = painterClass('shared-id');
      const other = painterClass('other');
      const replacement = painterClass('shared-id');
      extraProviders = [
        { provide: PAINTERS, useValue: { forPieceType: 'spec.Piece', painterClass: original }, multi: true },
        { provide: PAINTERS, useValue: { forPieceType: 'spec.Piece', painterClass: other }, multi: true },
        { provide: PAINTERS, useValue: { forPieceType: 'spec.Piece', load: () => Promise.resolve(replacement) }, multi: true },
      ];
      create();
      await settle();
      expect(display.paintersForType('spec.Piece')).toEqual([replacement, other]);
    });
  });

  describe('collision intro', () => {
    /** An intro that records what the display asks of it. */
    class RecordingIntro implements CollisionIntro {
      static played: RecordingIntro[] = [];
      readonly durationMs = 1000;
      readonly updates: number[] = [];
      ended = false;
      constructor() { RecordingIntro.played.push(this); }
      begin(parent: Object3D): void { parent.add(new Mesh()); }
      update(elapsedMs: number): void { this.updates.push(elapsedMs); }
      end(): void { this.ended = true; }
    }

    const tweenCount = () => (display as unknown as { tweenGroup: { getAll(): unknown[] } }).tweenGroup.getAll().length;
    const advanceTweens = (ms: number) =>
      (display as unknown as { tweenGroup: { update(time: number): void } }).tweenGroup.update(performance.now() + ms);

    beforeEach(() => {
      RecordingIntro.played = [];
    });

    it('starts the time animation at once when no intro is registered', async () => {
      create();
      const animateTime = vi.spyOn(display, 'animateTime');
      await display.animateWithCollision();
      expect(animateTime).toHaveBeenCalledTimes(1);
      expect(three.sceneEvent.getObjectByName('CollisionIntro')).toBeUndefined();
    });

    it('plays the intro on the event layer, then the time animation; the ended intro leaves no tween', async () => {
      extraProviders = [{ provide: COLLISION_INTRO, useValue: () => Promise.resolve(RecordingIntro) }];
      create();
      expect(display.hasCollisionIntro).toBe(true);
      const animateTime = vi.spyOn(display, 'animateTime');
      await display.animateWithCollision();

      const group = three.sceneEvent.getObjectByName('CollisionIntro')!;
      expect(group.children[0].layers.mask).toBe(1 << EVENT_DATA_LAYER);
      expect(tweenCount()).toBe(1);

      advanceTweens(2000);
      const [intro] = RecordingIntro.played;
      expect(intro.updates.at(-1)).toBe(1000);
      expect(intro.ended).toBe(true);
      expect(three.sceneEvent.getObjectByName('CollisionIntro')).toBeUndefined();
      expect(animateTime).toHaveBeenCalledTimes(1);
      // Only the time animation's tween is left
      expect(tweenCount()).toBe(1);
      display.stopTimeAnimation();
      expect(tweenCount()).toBe(0);
    });

    it('a new playback ends the running intro', async () => {
      extraProviders = [{ provide: COLLISION_INTRO, useValue: () => Promise.resolve(RecordingIntro) }];
      create();
      await display.animateWithCollision();
      await display.animateWithCollision();
      expect(RecordingIntro.played.map(intro => intro.ended)).toEqual([true, false]);
      expect(three.sceneEvent.children.filter(child => child.name === 'CollisionIntro')).toHaveLength(1);
      expect(tweenCount()).toBe(1);

      // Two requests in the same tick: the later one replaces the earlier
      await Promise.all([display.animateWithCollision(), display.animateWithCollision()]);
      expect(RecordingIntro.played.map(intro => intro.ended)).toEqual([true, true, true, false]);
      expect(tweenCount()).toBe(1);
    });

    it('stopping the time animation stops a running intro before it starts one', async () => {
      extraProviders = [{ provide: COLLISION_INTRO, useValue: () => Promise.resolve(RecordingIntro) }];
      create();
      const animateTime = vi.spyOn(display, 'animateTime');
      await display.animateWithCollision();
      display.exitTimedDisplay();
      advanceTweens(2000);
      expect(RecordingIntro.played[0].ended).toBe(true);
      expect(animateTime).not.toHaveBeenCalled();
      expect(tweenCount()).toBe(0);
    });

    it('the animate-collision command plays it', async () => {
      extraProviders = [
        { provide: COLLISION_INTRO, useValue: () => Promise.resolve(RecordingIntro) },
        { provide: COMMAND_HANDLERS, useClass: AnimateCollisionCommandHandler, multi: true },
      ];
      create();
      await commandBus.dispatch({ type: 'animate-collision', source: 'ui' });
      expect(RecordingIntro.played).toHaveLength(1);
    });
  });
});
