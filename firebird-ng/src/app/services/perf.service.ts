// perf.service.ts (optimized snippet)
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {WebGLRenderer} from "three";
export interface PerfLog {
  fps: number;
  frameTime: number;  // Changed from 'cpu' to 'frameTime'
  calls: number;
  triangles: number;
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
  });
  public perf$ = this.perfSubject.asObservable();

  private lastUpdateTime = performance.now();
  private frameCount = 0;
  private frameTimes: number[] = [];
  private readonly updateInterval = 250; // milliseconds

  public updateStats(renderer: WebGLRenderer, frameStartTime: number) {
    const now = performance.now();
    const thisFrameTime = now - frameStartTime;

    this.frameCount++;
    this.frameTimes.push(thisFrameTime);

    // Check if the interval has elapsed
    if (now - this.lastUpdateTime >= this.updateInterval) {
      const deltaSeconds = (now - this.lastUpdateTime) / 1000;
      const fps = this.frameCount / deltaSeconds;

      // Calculate average frame time
      const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;

      // Read renderer info only once
      const info = renderer.info.render;

      // Update the metrics object
      const log: PerfLog = {
        fps: fps,
        frameTime: avgFrameTime,  // Now shows actual frame render time in ms
        calls: info.calls,
        triangles: info.triangles,
      };

      this.perfSubject.next(log);

      // Reset counters
      this.lastUpdateTime = now;
      this.frameCount = 0;
      this.frameTimes = [];
    }
  }
}
