import { TestBed } from '@angular/core/testing';
import { ThreeService } from './three.service';
import { PerfService } from './perf.service';
import type { ThreeExtension } from '../firebird/three-extension';

/** A promise with its resolve/reject handles. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = () => res(); reject = rej; });
  return { promise, resolve, reject };
}

/** The private members these specs drive. */
type ThreeInternals = {
  createScene: (element: HTMLElement) => Promise<void>;
  attachRenderer: (element: HTMLElement) => void;
  startRendering: () => void;
  stopRendering: () => void;
  renderLoop: () => void;
  initialized: boolean;
  shouldRender: boolean;
  animationFrameId: number | null;
  views: unknown[];
  renderer: unknown;
  extensions: ThreeExtension[];
  frameContext: unknown;
  frameCallbacks: Array<() => void>;
};

describe('ThreeService', () => {
  let service: ThreeService;
  let internals: ThreeInternals;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ThreeService, { provide: PerfService, useValue: { updateStats: () => undefined } }],
    });
    service = TestBed.inject(ThreeService);
    internals = service as unknown as ThreeInternals;
  });

  it('should throw error if container not found when using string id', async () => {
    // This test doesn't require WebGPU - it fails before renderer creation
    await expect(service.init('nonexistent-id')).rejects.toThrow(/Container element #nonexistent-id not found/);
  });

  describe('init re-entrancy (scene creation stubbed: no WebGPU in tests)', () => {
    let creation: ReturnType<typeof deferred>;
    let createScene: ReturnType<typeof vi.fn>;
    let attachRenderer: ReturnType<typeof vi.fn>;
    let startRendering: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      creation = deferred();
      createScene = vi.fn(() => creation.promise);
      attachRenderer = vi.fn();
      startRendering = vi.fn();
      internals.createScene = createScene as unknown as ThreeInternals['createScene'];
      internals.attachRenderer = attachRenderer as unknown as ThreeInternals['attachRenderer'];
      internals.startRendering = startRendering as unknown as ThreeInternals['startRendering'];
    });

    it('creates the scene once for concurrent calls, and only the latest call attaches', async () => {
      const first = document.createElement('div');
      const second = document.createElement('div');
      const firstInit = service.init(first);
      const secondInit = service.init(second);
      creation.resolve();

      expect(await firstInit).toBe(false);
      expect(await secondInit).toBe(true);
      expect(createScene).toHaveBeenCalledTimes(1);
      expect(createScene).toHaveBeenCalledWith(first);
      expect(attachRenderer).toHaveBeenCalledTimes(1);
      expect(attachRenderer).toHaveBeenCalledWith(second);
      expect(startRendering).toHaveBeenCalledTimes(1);
    });

    it('does not start the loop when the page detached while the scene was being created', async () => {
      const pending = service.init(document.createElement('div'));
      service.detach();
      creation.resolve();

      expect(await pending).toBe(false);
      expect(startRendering).not.toHaveBeenCalled();
    });

    it('re-attaches on a later visit without creating the scene again', async () => {
      creation.resolve();
      expect(await service.init(document.createElement('div'))).toBe(true);
      service.detach();
      const revisit = document.createElement('div');
      expect(await service.init(revisit)).toBe(true);

      expect(createScene).toHaveBeenCalledTimes(1);
      expect(attachRenderer).toHaveBeenCalledWith(revisit);
      expect(startRendering).toHaveBeenCalledTimes(2);
    });

    it('retries the creation after a failed one', async () => {
      const failing = service.init(document.createElement('div'));
      creation.reject(new Error('no adapter'));
      await expect(failing).rejects.toThrow('no adapter');

      createScene.mockImplementation(() => Promise.resolve());
      expect(await service.init(document.createElement('div'))).toBe(true);
      expect(createScene).toHaveBeenCalledTimes(2);
    });
  });

  describe('render loop isolation', () => {
    function stubFrame() {
      const view = {
        dirty: true,
        controls: { update: () => undefined },
        renderFullFrame: vi.fn(),
        renderOverlays: vi.fn(),
        dispose: vi.fn(),
      };
      internals.initialized = true;
      internals.views = [view];
      internals.renderer = { domElement: document.createElement('canvas'), dispose: vi.fn() };
      internals.frameContext = { deltaTime: 0, renderer: internals.renderer, camera: null, invalidate: () => undefined };
      return view;
    }

    function runOneFrame() {
      service.invalidate();
      internals.shouldRender = true;
      internals.renderLoop();
      internals.stopRendering();
    }

    beforeEach(() => {
      // The loop schedules its next tick; nothing must run behind the test.
      vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    afterEach(() => {
      internals.stopRendering();
      vi.unstubAllGlobals();
    });

    it('disables a throwing onFrame hook and keeps rendering and the other hooks', () => {
      const view = stubFrame();
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const bad: ThreeExtension = { onFrame: vi.fn(() => { throw new Error('boom'); }) };
      const good: ThreeExtension = { onFrame: vi.fn() };
      internals.extensions = [bad, good];

      runOneFrame();
      runOneFrame();

      expect(bad.onFrame).toHaveBeenCalledTimes(1);
      expect(good.onFrame).toHaveBeenCalledTimes(2);
      expect(view.renderFullFrame).toHaveBeenCalledTimes(2);
      expect(service.renderedFrameCount).toBe(2);
      expect(errors).toHaveBeenCalledTimes(1);
      errors.mockRestore();
    });

    it('removes a throwing frame callback and keeps the others', () => {
      stubFrame();
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const bad = vi.fn(() => { throw new Error('boom'); });
      const good = vi.fn();
      service.addFrameCallback(bad);
      service.addFrameCallback(good);

      runOneFrame();
      runOneFrame();

      expect(bad).toHaveBeenCalledTimes(1);
      expect(good).toHaveBeenCalledTimes(2);
      expect(internals.frameCallbacks).toEqual([good]);
      errors.mockRestore();
    });

    it('stays idle on demand when nothing invalidated', () => {
      const view = stubFrame();
      runOneFrame();
      view.dirty = false;
      internals.shouldRender = true;
      internals.renderLoop();
      internals.stopRendering();
      expect(view.renderFullFrame).toHaveBeenCalledTimes(1);
    });
  });
});
