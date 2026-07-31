// perf-stats.component.ts
import { Component, ChangeDetectionStrategy, Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { PerfService, PerfLog } from '../../services/perf.service';

@Component({
  selector: 'app-perf-stats',
  templateUrl: './perf-stats.component.html',
  imports: [
    DecimalPipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./perf-stats.component.scss']
})
export class PerfStatsComponent {
  // toSignal keeps the template updating under zoneless: the perf$ stream is
  // produced inside the render loop, outside any Angular scheduling.
  perf: Signal<PerfLog> = toSignal(inject(PerfService).perf$, {
    initialValue: { fps: 0, frameTime: 0, calls: 0, triangles: 0 },
  });
}
