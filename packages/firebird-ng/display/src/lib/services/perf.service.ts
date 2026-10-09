// perf.service.ts (optimized snippet)
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {WebGPURenderer} from "three/webgpu";
export interface PerfLog {
  fps: number;
  frameTime: number;  // Changed from 'cpu' to 'frameTime'
  calls: number;
  triangles: number;
  /** Render scheduling mode of the loop (config `rendering.mode`). */
  mode: 'continuous' | 'on-demand';
  /** True when on-demand and nothing rendered in the last interval — the
   * display is up to date, not hung. FPS reads 0 by design while idle. */
  idle: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PerfService {
  private perfSubject = new BehaviorSubject<PerfLog>({
    fps: 0,
    frameTime: 0,
    calls: 0,
    triangles: 0,
    mode: 'continuous',
    idle: false,
  });
  public perf$ = this.perfSubject.asObservable();

  private lastUpdateTime = performance.now();
  private frameCount = 0;
  private frameTimes: number[] = [];
  private readonly updateInterval = 250; // milliseconds

  /**
   * Called every animation-frame tick. `rendered` says whether this tick
   * actually rendered — FPS counts rendered frames only, so an idle
   * on-demand loop correctly decays to 0 (flagged `idle`, not a hang).
   */
  public updateStats(renderer: WebGPURenderer, frameStartTime: number, rendered = true, continuous = true) {
    const now = performance.now();

    if (rendered) {
      this.frameCount++;
      this.frameTimes.push(now - frameStartTime);
    }

    // Check if the interval has elapsed
    if (now - this.lastUpdateTime >= this.updateInterval) {
      const deltaSeconds = (now - this.lastUpdateTime) / 1000;
      const fps = this.frameCount / deltaSeconds;

      // Average frame time over rendered frames (0 while idle)
      const avgFrameTime = this.frameTimes.length
        ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
        : 0;

      // Read renderer info only once
      const info = renderer.info.render as { calls: number; triangles: number; drawCalls?: number };

      // WebGPURenderer semantics differ from WebGLRenderer: info.render.calls is a
      // cumulative total that never resets, while drawCalls holds the per-frame count.
      const callsPerFrame = info.drawCalls !== undefined ? info.drawCalls : info.calls;

      const log: PerfLog = {
        fps: fps,
        frameTime: avgFrameTime,
        calls: callsPerFrame,
        triangles: info.triangles,
        mode: continuous ? 'continuous' : 'on-demand',
        idle: !continuous && this.frameCount === 0,
      };

      this.perfSubject.next(log);

      // Reset counters
      this.lastUpdateTime = now;
      this.frameCount = 0;
      this.frameTimes = [];
    }
  }
}
