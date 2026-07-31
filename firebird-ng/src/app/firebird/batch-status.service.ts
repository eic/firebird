/**
 * Publishes display readiness to `window.firebird` for batch tools:
 * `pyrobird screenshot` and other headless drivers await these flags
 * instead of sleeping a fixed time and racing the geometry load.
 *
 * window.firebird = {
 *   geometryReady:       geometry finished loading (or none is pending),
 *   startupCommandsDone: the startup command queue ran to completion,
 *   pendingLoads:        number of in-flight geometry/event loads,
 *   ready:               everything above settled — safe to capture,
 * }
 */

import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CommandBusService } from './command-bus.service';

declare global {
  interface Window {
    firebird?: {
      geometryReady: boolean;
      startupCommandsDone: boolean;
      pendingLoads: number;
      ready: boolean;
    };
  }
}

@Injectable({ providedIn: 'root' })
export class BatchStatusService {
  private commandBus = inject(CommandBusService);

  private pendingGeometry = signal(0);
  private pendingEvents = signal(0);
  private geometryLoadedOnce = signal(false);

  readonly geometryReady = computed(() =>
    this.pendingGeometry() === 0 && (this.geometryLoadedOnce() || this.commandBus.startupCommandsDone()));

  readonly ready = computed(() =>
    this.commandBus.startupCommandsDone()
    && this.pendingGeometry() === 0
    && this.pendingEvents() === 0);

  constructor() {
    effect(() => {
      window.firebird = {
        geometryReady: this.geometryReady(),
        startupCommandsDone: this.commandBus.startupCommandsDone(),
        pendingLoads: this.pendingGeometry() + this.pendingEvents(),
        ready: this.ready(),
      };
    });
  }

  beginGeometryLoad(): void {
    this.pendingGeometry.update(n => n + 1);
  }

  endGeometryLoad(success: boolean): void {
    this.pendingGeometry.update(n => Math.max(0, n - 1));
    if (success) {
      this.geometryLoadedOnce.set(true);
    }
  }

  beginEventLoad(): void {
    this.pendingEvents.update(n => n + 1);
  }

  endEventLoad(): void {
    this.pendingEvents.update(n => Math.max(0, n - 1));
  }
}
