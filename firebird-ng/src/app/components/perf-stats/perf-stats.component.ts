// perf-stats.component.ts
import { Component, OnInit } from '@angular/core';
import { PerfService, PerfLog } from '../../services/perf.service';
import {MatTooltip} from "@angular/material/tooltip";
import {DecimalPipe} from "@angular/common"; // adjust path as needed

@Component({
  selector: 'app-perf-stats',
  templateUrl: './perf-stats.component.html',
  imports: [
    DecimalPipe
  ],
  styleUrls: ['./perf-stats.component.scss']
})
export class PerfStatsComponent implements OnInit {
  perf: PerfLog = { fps: 0, frameTime: 0, calls: 0, triangles: 0 };

  constructor(private perfService: PerfService) {}

  ngOnInit(): void {
    this.perfService.perf$.subscribe((log: PerfLog) => {
      this.perf = log;
    });
  }
}
