/**
 * The built-in command handlers: what each command needs, which display
 * service it reaches, and the errors a deep link or batch script sees when a
 * command cannot run. The display services are stubs: the handlers resolve
 * them through dynamic imports, which TestBed's providers answer.
 */
import { TestBed } from '@angular/core/testing';
import { Type, provideZonelessChangeDetection, signal } from '@angular/core';
import { AppCommand, CommandHandler, ConfigService } from '@dexvis/app-features';
import {
  AnimateCollisionCommandHandler,
  CameraPresetCommandHandler,
  OpenDexCommandHandler,
  OpenGeometryCommandHandler,
  SetConfigCommandHandler,
  ShowEventCommandHandler,
} from './builtin-command-handlers';
import { withCameraPreset } from '@dexvis/firebird-ng/api';
import { DataModelService, EventDisplayService, ThreeService } from '@dexvis/firebird-ng/display';

const dataModel = {
  entries: signal<unknown[]>([]),
  setCurrentEntry: vi.fn(),
};
const three = { applyCameraPreset: vi.fn() };
const eventDisplay = {
  animateWithCollision: vi.fn(() => Promise.resolve()),
  openGeometry: vi.fn((url: string) => Promise.resolve(url)),
  openEvents: vi.fn((url: string) => Promise.resolve(url)),
};

function handler<T extends CommandHandler>(handlerClass: Type<T>): T {
  return TestBed.inject(handlerClass);
}

describe('built-in command handlers', () => {
  beforeEach(() => {
    localStorage.clear();
    dataModel.entries.set([]);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ...withCameraPreset({ name: 'endcap', position: [0, 0, 9000], target: [0, 0, 0] }).providers,
        OpenGeometryCommandHandler,
        OpenDexCommandHandler,
        ShowEventCommandHandler,
        SetConfigCommandHandler,
        CameraPresetCommandHandler,
        AnimateCollisionCommandHandler,
        { provide: DataModelService, useValue: dataModel },
        { provide: ThreeService, useValue: three },
        { provide: EventDisplayService, useValue: eventDisplay },
      ],
    });
  });

  describe('open-geometry', () => {
    it('builds the command from a URL argument', () => {
      expect(handler(OpenGeometryCommandHandler).fromUrlArg('https://host/detector.geo'))
        .toEqual({ type: 'open-geometry', url: 'https://host/detector.geo' });
    });

    it('loads through the display, which picks the claiming loader', async () => {
      await handler(OpenGeometryCommandHandler).execute({ type: 'open-geometry', url: 'https://host/detector.geo' });
      expect(eventDisplay.openGeometry).toHaveBeenCalledWith('https://host/detector.geo');
    });

    it("fails with the display's reason", async () => {
      eventDisplay.openGeometry.mockRejectedValueOnce(new Error("No geometry loader claims 'detector.gdml'"));
      await expect(handler(OpenGeometryCommandHandler).execute({ type: 'open-geometry', url: 'detector.gdml' }))
        .rejects.toThrow("No geometry loader claims 'detector.gdml'");
    });

    it('requires a url', async () => {
      await expect(handler(OpenGeometryCommandHandler).execute({ type: 'open-geometry' }))
        .rejects.toThrow("open-geometry: 'url' argument is required");
    });
  });

  describe('open-dex', () => {
    it('builds the command from a URL argument', () => {
      expect(handler(OpenDexCommandHandler).fromUrlArg('https://host/events.json'))
        .toEqual({ type: 'open-dex', url: 'https://host/events.json' });
    });

    it('loads through the display, which picks the claiming loader', async () => {
      await handler(OpenDexCommandHandler).execute({ type: 'open-dex', url: 'https://host/events.json' });
      expect(eventDisplay.openEvents).toHaveBeenCalledWith('https://host/events.json');
    });

    it("fails with the display's reason", async () => {
      eventDisplay.openEvents.mockRejectedValueOnce(new Error('HTTP 404 Not Found (https://host/events.json)'));
      await expect(handler(OpenDexCommandHandler).execute({ type: 'open-dex', url: 'https://host/events.json' }))
        .rejects.toThrow('HTTP 404 Not Found (https://host/events.json)');
    });

    it('requires a url', async () => {
      await expect(handler(OpenDexCommandHandler).execute({ type: 'open-dex' }))
        .rejects.toThrow("open-dex: 'url' argument is required");
    });
  });

  describe('show-event', () => {
    it('parses the index from a URL argument', () => {
      expect(handler(ShowEventCommandHandler).fromUrlArg('3')).toEqual({ type: 'show-event', index: 3 });
    });

    it('selects the entry with that index', async () => {
      const entries = [{ id: 'a' }, { id: 'b' }];
      dataModel.entries.set(entries);
      await handler(ShowEventCommandHandler).execute({ type: 'show-event', index: 1 });
      expect(dataModel.setCurrentEntry).toHaveBeenCalledWith(entries[1]);
    });

    it('rejects an index outside the loaded entries', async () => {
      dataModel.entries.set([{ id: 'a' }, { id: 'b' }]);
      await expect(handler(ShowEventCommandHandler).execute({ type: 'show-event', index: 5 }))
        .rejects.toThrow('show-event: index 5 out of range (0..1)');
      expect(dataModel.setCurrentEntry).not.toHaveBeenCalled();
    });

    it('requires a numeric index', async () => {
      await expect(handler(ShowEventCommandHandler).execute({ type: 'show-event', index: 'last' }))
        .rejects.toThrow("show-event: numeric 'index' argument is required");
    });
  });

  describe('set-config', () => {
    const command = (source: AppCommand['source'], value: unknown): AppCommand =>
      ({ type: 'set-config', key: 'spec.width', value, source });

    it('splits a URL argument at the first =', () => {
      expect(handler(SetConfigCommandHandler).fromUrlArg('spec.url=https://host/?a=b'))
        .toEqual({ type: 'set-config', key: 'spec.url', value: 'https://host/?a=b' });
      expect(handler(SetConfigCommandHandler).fromUrlArg('spec.flag'))
        .toEqual({ type: 'set-config', key: 'spec.flag', value: '' });
    });

    for (const source of ['url', 'server', 'batch'] as const) {
      it(`applies a ${source} value for the session only`, () => {
        const property = TestBed.inject(ConfigService).declare({ key: 'spec.width', default: 1 });
        handler(SetConfigCommandHandler).execute(command(source, '7'));
        expect(property.value).toBe(7);
        expect(property.hasSessionOverride).toBe(true);
        expect(property.hasStoredValue()).toBe(false);
      });
    }

    it('persists a ui value, converted to the declared type', () => {
      const property = TestBed.inject(ConfigService).declare({ key: 'spec.width', default: 1 });
      handler(SetConfigCommandHandler).execute(command('ui', '7'));
      expect(property.value).toBe(7);
      expect(property.hasSessionOverride).toBe(false);
      expect(property.hasStoredValue()).toBe(true);
    });

    it('keeps a ui value for a key no code declared yet, typed by the later declaration', () => {
      handler(SetConfigCommandHandler).execute(command('ui', '7'));
      const property = TestBed.inject(ConfigService).declare({ key: 'spec.width', default: 1 });
      expect(property.value).toBe(7);
    });

    it('requires a key', () => {
      expect(() => handler(SetConfigCommandHandler).execute({ type: 'set-config', value: 1 }))
        .toThrow("set-config: 'key' argument is required");
    });
  });

  describe('camera-preset', () => {
    it('moves the camera to a registered preset', async () => {
      await handler(CameraPresetCommandHandler).execute({ type: 'camera-preset', name: 'endcap' });
      expect(three.applyCameraPreset).toHaveBeenCalledWith(expect.objectContaining({ name: 'endcap' }));
    });

    it('names the known presets for an unknown one', async () => {
      await expect(handler(CameraPresetCommandHandler).execute({ type: 'camera-preset', name: 'barrel' }))
        .rejects.toThrow("camera-preset: unknown preset 'barrel'. Known: endcap");
      expect(three.applyCameraPreset).not.toHaveBeenCalled();
    });
  });

  describe('animate-collision', () => {
    it('starts the collision animation of the display', async () => {
      await handler(AnimateCollisionCommandHandler).execute();
      expect(eventDisplay.animateWithCollision).toHaveBeenCalledTimes(1);
    });
  });
});
