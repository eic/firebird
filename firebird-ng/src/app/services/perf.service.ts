// perf.service.ts (optimized snippet)
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {WebGLRenderer} from "three";

export interface PerfLog {
  fps: number;
  cpu: number;
  calls: number;
  triangles: number;
}

@Injectable({
  providedIn: 'root',
})
export class PerfService {
  private perfSubject = new BehaviorSubject<PerfLog>({
    fps: 0,
    cpu: 0,
    calls: 0,
    triangles: 0,
  });
  public perf$ = this.perfSubject.asObservable();

  private lastUpdateTime = performance.now();
  private frameCount = 0;

  // Instead of updating every frame, update every 250 ms:
  private readonly updateInterval = 250; // milliseconds

  public updateStats(renderer: WebGLRenderer) {
    const now = performance.now();
    this.frameCount++;

    // Check if the interval has elapsed
    if (now - this.lastUpdateTime >= this.updateInterval) {
      const deltaSeconds = (now - this.lastUpdateTime) / 1000;
      const fps = this.frameCount / deltaSeconds;

      // Minimal CPU measurement: difference between update intervals
      const cpuTime = now - this.lastUpdateTime;

      // Read renderer info only once
      const info = renderer.info.render;

      // Update the metrics object
      const log: PerfLog = {
        fps: fps,
        cpu: cpuTime, // This is a rough measure; for real CPU usage you may need a more robust approach.
        calls: info.calls,
        triangles: info.triangles,
      };

      this.perfSubject.next(log);

      // Reset counters
      this.lastUpdateTime = now;
      this.frameCount = 0;
    }
  }
}
