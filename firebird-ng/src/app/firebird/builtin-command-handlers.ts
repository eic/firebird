/**
 * Built-in command handlers, registered through the same COMMAND_HANDLERS
 * token user extensions get. Each handler owns one command type and its
 * `?cmd=type:arg` URL grammar.
 */

import { Injectable, Injector, inject } from '@angular/core';
import { CommandHandler, FbCommand } from './command-bus.service';
import { GEOMETRY_LOADERS, EVENT_LOADERS } from './tokens';
import { ConfigService } from '../services/config.service';

// Handlers live in the initial bundle (referenced from app.config), so the
// display-stack services (three.js and friends) are resolved through DYNAMIC
// imports at execute time — a static import would defeat route code-splitting.

/** Polls a condition (startup-path only — never inside the frame loop). */
async function waitFor(condition: () => boolean, timeoutMs: number, stepMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise(resolve => setTimeout(resolve, stepMs));
  }
  return condition();
}

/** `open-geometry` — load detector geometry: `{ type, url }` / `?cmd=open-geometry:URL`. */
@Injectable()
export class OpenGeometryCommandHandler implements CommandHandler {
  readonly type = 'open-geometry';
  private loaders = inject(GEOMETRY_LOADERS, { optional: true }) ?? [];

  fromUrlArg(arg: string): FbCommand {
    return { type: this.type, url: arg };
  }

  async execute(command: FbCommand): Promise<void> {
    const url = command['url'] as string;
    if (!url) throw new Error(`open-geometry: 'url' argument is required`);
    const loader = this.loaders.find(l => l.canLoad(url));
    if (!loader) {
      const known = this.loaders.map(l => `${l.meta.label} (${l.meta.fileExtensions.join(', ')})`).join('; ');
      throw new Error(`open-geometry: no loader claims '${url}'. Known formats: ${known}`);
    }
    await loader.load(url);
  }
}

/** `open-dex` — load event data: `{ type, url }` / `?cmd=open-dex:URL` / `?dex=URL`. */
@Injectable()
export class OpenDexCommandHandler implements CommandHandler {
  readonly type = 'open-dex';
  private loaders = inject(EVENT_LOADERS, { optional: true }) ?? [];

  fromUrlArg(arg: string): FbCommand {
    return { type: this.type, url: arg };
  }

  async execute(command: FbCommand): Promise<void> {
    const url = command['url'] as string;
    if (!url) throw new Error(`open-dex: 'url' argument is required`);
    const loader = this.loaders.find(l => l.canLoad(url));
    if (!loader) {
      const known = this.loaders.map(l => `${l.meta.label} (${l.meta.fileExtensions.join(', ')})`).join('; ');
      throw new Error(`open-dex: no loader claims '${url}'. Known formats: ${known}`);
    }
    const data = await loader.loadEvents(url);
    if (data === null) {
      throw new Error(`open-dex: loader '${loader.meta.id}' failed for '${url}'`);
    }
  }
}

/** `show-event` — select entry by index: `{ type, index }` / `?event=N`. */
@Injectable()
export class ShowEventCommandHandler implements CommandHandler {
  readonly type = 'show-event';
  private injector = inject(Injector);

  fromUrlArg(arg: string): FbCommand {
    return { type: this.type, index: parseInt(arg, 10) };
  }

  async execute(command: FbCommand): Promise<void> {
    const index = Number(command['index']);
    if (isNaN(index)) throw new Error(`show-event: numeric 'index' argument is required`);

    const { DataModelService } = await import('../services/data-model.service');
    const data = this.injector.get(DataModelService);

    // Events may still be loading (config-driven autoload runs in parallel).
    const loaded = await waitFor(() => data.entries().length > 0, 30_000);
    if (!loaded) {
      throw new Error('show-event: no events were loaded within 30 s');
    }
    const entries = data.entries();
    if (index < 0 || index >= entries.length) {
      throw new Error(`show-event: index ${index} out of range (0..${entries.length - 1})`);
    }
    data.setCurrentEntry(entries[index]);
  }
}

/**
 * `set-config` — set a config value: `{ type, key, value }` / `?cmd=set-config:key=value`.
 * URL/server/batch sources apply as SESSION values (never persisted — a link
 * or script cannot poison saved user preferences); ui/code sources persist.
 */
@Injectable()
export class SetConfigCommandHandler implements CommandHandler {
  readonly type = 'set-config';
  private config = inject(ConfigService);

  fromUrlArg(arg: string): FbCommand {
    const eq = arg.indexOf('=');
    if (eq < 0) return { type: this.type, key: arg, value: '' };
    return { type: this.type, key: arg.substring(0, eq), value: arg.substring(eq + 1) };
  }

  execute(command: FbCommand): void {
    const key = command['key'] as string;
    if (!key) throw new Error(`set-config: 'key' argument is required`);
    const value = command['value'];
    const transient = command.source === 'url' || command.source === 'server' || command.source === 'batch';
    if (transient) {
      this.config.applySessionValue(key, value);
    } else {
      const property = this.config.getConfigOrCreate(key, value);
      property.setValue(value);
    }
  }
}

type Vec3Tuple = [number, number, number];

/** A camera preset: either an absolute pose, or a view direction that keeps the current target and distance. */
type CameraPreset =
  | { position: Vec3Tuple; target: Vec3Tuple; up?: Vec3Tuple }
  | { direction: Vec3Tuple; up: Vec3Tuple };

/** `camera-preset` — move the camera to a named preset: `?cmd=camera-preset:top`. */
@Injectable()
export class CameraPresetCommandHandler implements CommandHandler {
  readonly type = 'camera-preset';
  private injector = inject(Injector);

  // HENP axis convention: beam along Z (screen-right in the front view), Y up,
  // X toward the accelerator center (into the screen in the front view).
  // Face presets keep the current orbit target and distance; `up` defines the
  // screen roll — the top/bottom views keep Z pointing right on screen.
  // Position/target presets match the main-display lil-gui presets.
  private presets: Record<string, CameraPreset> = {
    'front':  { direction: [-1, 0, 0], up: [0, 1, 0] },
    'back':   { direction: [1, 0, 0],  up: [0, 1, 0] },
    'right':  { direction: [0, 0, 1],  up: [0, 1, 0] },
    'left':   { direction: [0, 0, -1], up: [0, 1, 0] },
    'top':    { direction: [0, 1, 0],  up: [1, 0, 0] },
    'bottom': { direction: [0, -1, 0], up: [-1, 0, 0] },
    'home':   { position: [0, 7000, 0], target: [0, 0, 0], up: [1, 0, 0] },
    'center': { position: [-3600, 2900, -4700], target: [0, 0, 0], up: [0, 1, 0] },
    'farforward': { position: [8000, 7500, 40000], target: [0, 0, 30000], up: [0, 1, 0] },
  };

  fromUrlArg(arg: string): FbCommand {
    return { type: this.type, name: arg };
  }

  async execute(command: FbCommand): Promise<void> {
    const name = command['name'] as string;
    const preset = this.presets[name];
    if (!preset) {
      throw new Error(`camera-preset: unknown preset '${name}'. Known: ${Object.keys(this.presets).join(', ')}`);
    }
    const { ThreeService } = await import('../services/three.service');
    const { Vector3 } = await import('three');
    const three = this.injector.get(ThreeService);

    if ('direction' in preset) {
      const target = three.controls.target;
      const distance = three.camera.position.distanceTo(target) || 7000;
      three.camera.position
        .copy(target)
        .addScaledVector(new Vector3(...preset.direction), distance);
    } else {
      three.camera.position.set(...preset.position);
      three.controls.target.set(...preset.target);
    }

    if (preset.up) three.setCameraUp(new Vector3(...preset.up));

    three.controls.update();
  }
}
