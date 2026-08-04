import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';

import { EventDisplayService } from '../../services/event-display.service';
import { ThreeService } from '../../services/three.service';
import { ConfigService } from '../../services/config.service';
import { RenderView } from '../../services/render-view';

/**
 * Quad view: the classic 4-projection layout over the one shared scene.
 *
 * Top-left is the MAIN view (the same camera and controls as the display
 * page — including the navigation cube, which follows the main view). The
 * other three cells are orthographic projections locked to the standard
 * directions; they pan and zoom but do not rotate.
 *
 * The shared canvas fills the page behind a CSS grid of view cells; each
 * view renders its scissored rectangle. Adding a view is one
 * `three.addView({container, ...})` call — this page is the reference
 * consumer of that API.
 */
@Component({
  selector: 'app-split-window',
  imports: [],
  templateUrl: './split-window.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './split-window.component.scss',
})
export class SplitWindowComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host') host!: ElementRef<HTMLElement>;
  @ViewChild('cellMain') cellMain!: ElementRef<HTMLElement>;
  @ViewChild('cellTop') cellTop!: ElementRef<HTMLElement>;
  @ViewChild('cellFront') cellFront!: ElementRef<HTMLElement>;
  @ViewChild('cellRight') cellRight!: ElementRef<HTMLElement>;

  /** Views added by this page (the main view is not in this list — it stays). */
  private addedViews: RenderView[] = [];
  private resizeObserver?: ResizeObserver;

  constructor(
    private eventDisplay: EventDisplayService,
    private three: ThreeService,
    private config: ConfigService,
  ) {}

  async ngAfterViewInit(): Promise<void> {
    // First visit initializes the scene into the page host; a revisit
    // re-attaches the existing canvas. Either way the canvas ends up filling
    // the host, behind the view cells.
    await this.eventDisplay.initThree(this.host.nativeElement);
    this.three.setMainViewContainer(this.cellMain.nativeElement);

    // Orthographic projections in the standard frame: beam along Z pointing
    // right on screen. Top looks down with X toward screen top; front and
    // right keep Y up. Initial visible height fits the whole detector.
    const orthoHeight = 15000;
    this.addedViews = [
      this.three.addView({
        name: 'top',
        container: this.cellTop.nativeElement,
        orthographic: true,
        orthoWorldHeight: orthoHeight,
        fixedDirection: { direction: [0, 1, 0], up: [1, 0, 0] },
      }),
      this.three.addView({
        name: 'front',
        container: this.cellFront.nativeElement,
        orthographic: true,
        orthoWorldHeight: orthoHeight,
        fixedDirection: { direction: [-1, 0, 0], up: [0, 1, 0] },
      }),
      this.three.addView({
        name: 'right',
        container: this.cellRight.nativeElement,
        orthographic: true,
        orthoWorldHeight: orthoHeight,
        fixedDirection: { direction: [0, 0, 1], up: [0, 1, 0] },
      }),
    ];

    // One resize mechanism for every source (window, layout): the canvas
    // tracks the host, the views recompute their rectangles from their cells.
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.host.nativeElement);
    this.layout();

    // Landing on this page directly: load the configured geometry/events the
    // display page would have loaded. Already-loaded data is skipped.
    this.autoLoad();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    for (const view of this.addedViews) {
      this.three.removeView(view);
    }
    this.addedViews = [];
  }

  private layout(): void {
    const host = this.host.nativeElement;
    this.three.setSize(host.clientWidth, host.clientHeight);
  }

  private autoLoad(): void {
    // getConfigOrCreate, not getConfig: on a direct landing nothing declared
    // these keys yet, and only declaration applies pending URL/server/default
    // values for them.
    const geometryUrl = this.config.getConfigOrCreate<string>('geometry.selectedGeometry', '').value;
    if (geometryUrl && this.eventDisplay.lastLoadedGeometryUrl !== geometryUrl) {
      this.eventDisplay.loadGeometry(geometryUrl).catch(error =>
        console.error(`[split-window] Geometry load failed: ${error}`));
    }

    const dexUrl = this.config.getConfigOrCreate<string>('events.dexEventsSource', '').value;
    if (dexUrl && this.eventDisplay.lastLoadedDexUrl !== dexUrl) {
      this.eventDisplay.loadDexData(dexUrl).catch(error =>
        console.error(`[split-window] Event data load failed: ${error}`));
    }
  }
}
