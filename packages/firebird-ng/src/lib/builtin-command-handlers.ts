/**
 * Built-in command handlers, registered through the same COMMAND_HANDLERS
 * token user extensions get. Each handler owns one command type and its
 * `?cmd=type:arg` URL grammar.
 */

import { Injectable, Injector, inject } from '@angular/core';
import { AppCommand, CommandHandler, ConfigService, coerceConfigValue } from '@dexvis/app-features';
import { injectCameraPresets } from '@dexvis/firebird-ng/api';

// Handlers live in the initial bundle (referenced from app.config), so the
// display-stack services (three.js and friends) are resolved through DYNAMIC
// imports at execute time: a static import would defeat route code-splitting.

/** Polls a condition (startup path only, never inside the frame loop). */
async function waitFor(condition: () => boolean, timeoutMs: number, stepMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise(resolve => setTimeout(resolve, stepMs));
  }
  return condition();
}

/** `open-geometry`: load detector geometry: `{ type, url }` / `?cmd=open-geometry:URL`. */
@Injectable()
export class OpenGeometryCommandHandler implements CommandHandler {
  readonly type = 'open-geometry';
  private injector = inject(Injector);

  fromUrlArg(arg: string): AppCommand {
    return { type: this.type, url: arg };
  }

  /** Loads through the first geometry loader that claims the URL; resolves when it is on screen. */
  async execute(command: AppCommand): Promise<void> {
    const url = command['url'] as string;
    if (!url) throw new Error(`open-geometry: 'url' argument is required`);
    const { EventDisplayService } = await import('@dexvis/firebird-ng/display');
    await this.injector.get(EventDisplayService).openGeometry(url);
  }
}

/** `open-dex`: load event data: `{ type, url }` / `?cmd=open-dex:URL` / `?dex=URL`. */
@Injectable()
export class OpenDexCommandHandler implements CommandHandler {
  readonly type = 'open-dex';
  private injector = inject(Injector);

  fromUrlArg(arg: string): AppCommand {
    return { type: this.type, url: arg };
  }

  /** Loads through the first event loader that claims the URL; resolves when the first event shows. */
  async execute(command: AppCommand): Promise<void> {
    const url = command['url'] as string;
    if (!url) throw new Error(`open-dex: 'url' argument is required`);
    const { EventDisplayService } = await import('@dexvis/firebird-ng/display');
    await this.injector.get(EventDisplayService).openEvents(url);
  }
}

/** `show-event`: select entry by index: `{ type, index }` / `?event=N`. */
@Injectable()
export class ShowEventCommandHandler implements CommandHandler {
  readonly type = 'show-event';
  private injector = inject(Injector);

  fromUrlArg(arg: string): AppCommand {
    return { type: this.type, index: parseInt(arg, 10) };
  }

  async execute(command: AppCommand): Promise<void> {
    const index = Number(command['index']);
    if (isNaN(index)) throw new Error(`show-event: numeric 'index' argument is required`);

    const { DataModelService } = await import('@dexvis/firebird-ng/display');
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
 * `set-config`: set a config value: `{ type, key, value }` / `?cmd=set-config:key=value`.
 * URL/server/batch sources apply as SESSION values (never persisted: a link
 * or script cannot poison saved user preferences); ui/code sources persist.
 * A ui/code write to a key no code declared yet goes to a placeholder: the
 * owning code's later declaration still sets the key's default, type and
 * validator, and reads the written value with them.
 */
@Injectable()
export class SetConfigCommandHandler implements CommandHandler {
  readonly type = 'set-config';
  private config = inject(ConfigService);

  fromUrlArg(arg: string): AppCommand {
    const eq = arg.indexOf('=');
    if (eq < 0) return { type: this.type, key: arg, value: '' };
    return { type: this.type, key: arg.substring(0, eq), value: arg.substring(eq + 1) };
  }

  execute(command: AppCommand): void {
    const key = command['key'] as string;
    if (!key) throw new Error(`set-config: 'key' argument is required`);
    const value = command['value'];
    const transient = command.source === 'url' || command.source === 'server' || command.source === 'batch';
    if (transient) {
      this.config.applySessionValue(key, value);
    } else {
      const property = this.config.getConfigOrPlaceholder(key, value);
      // Text from a URL-style argument becomes the declared type ('7' -> 7)
      property.setValue(coerceConfigValue(value, property.codeDefault));
    }
  }
}

/**
 * `camera-preset`: move the camera to a named preset: `?cmd=camera-preset:top`.
 * The presets come from `withCameraPreset()` registrations; the built-in
 * ones are the face views and `home` (see `withStandardCameraPresets()`).
 */
@Injectable()
export class CameraPresetCommandHandler implements CommandHandler {
  readonly type = 'camera-preset';
  private injector = inject(Injector);
  private presets = injectCameraPresets();

  fromUrlArg(arg: string): AppCommand {
    return { type: this.type, name: arg };
  }

  async execute(command: AppCommand): Promise<void> {
    const name = command['name'] as string;
    const preset = this.presets.find(candidate => candidate.name === name);
    if (!preset) {
      throw new Error(`camera-preset: unknown preset '${name}'. Known: ${this.presets.map(known => known.name).join(', ')}`);
    }
    const { ThreeService } = await import('@dexvis/firebird-ng/display');
    this.injector.get(ThreeService).applyCameraPreset(preset);
  }
}

/**
 * `animate-collision`: play the collision intro (`withCollisionIntro()`),
 * then the event's time animation from the start: `?cmd=animate-collision`.
 * Without an intro the time animation starts at once.
 */
@Injectable()
export class AnimateCollisionCommandHandler implements CommandHandler {
  readonly type = 'animate-collision';
  private injector = inject(Injector);

  async execute(): Promise<void> {
    const { EventDisplayService } = await import('@dexvis/firebird-ng/display');
    await this.injector.get(EventDisplayService).animateWithCollision();
  }
}
