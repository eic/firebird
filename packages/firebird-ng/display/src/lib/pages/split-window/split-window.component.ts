import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';

import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import GUI from 'lil-gui';
import { Subscription } from 'rxjs';

import { EventDisplayService } from '../../services/event-display.service';
import { ThreeService } from '../../services/three.service';
import { CommandBusService, ConfigService } from '@dexvis/app-features';
import { injectToolbarActions, ToolbarActionRegistration, type RenderView } from '@dexvis/firebird-ng/api';
import { FirebirdShellComponent } from '../../components/firebird-shell/firebird-shell.component';
import { EventSelectorComponent } from '../../components/event-selector/event-selector.component';
import { GeometryClippingComponent } from '../../components/geometry-clipping/geometry-clipping.component';
import { EventTimeControlComponent } from '../../components/event-time-control/event-time-control.component';
import { AnimationSettingsComponent } from '../../components/animation-settings/animation-settings.component';
import { PerfStatsComponent } from '../../components/perf-stats/perf-stats.component';
import { RecordingMenuComponent } from '../../components/recording-menu/recording-menu.component';
import { FirebirdDisplayComponent } from '../../components/firebird-display/firebird-display.component';

/**
 * Quad projection view: four views of the one shared scene, each with its
 * own geometry cut.
 *
 * Layout (fixed): top-left TOP (looking down -Y, cut by the XZ plane),
 * top-right SIDE (looking along +X, cut by the YZ plane), bottom-left
 * FRONT/XY (looking along -Z, cut by an adjustable XY plane — the
 * transverse view), bottom-right the MAIN 3D view with orbit controls and
 * the wedge/Z clipping of the display page (the navigation cube follows the
 * main view here).
 *
 * The three projection views are orthographic — tracks drawn over geometry
 * only line up with the cross-section without perspective distortion — and
 * share one independently clipped geometry copy (see ClippedGeometrySlice);
 * each writes its own plane into it right before rendering. Event data is
 * never clipped and is visible in every view.
 *
 * The toolbar carries the controls that make sense here (event selection,
 * the 3D view's clipping, time animation); the side panes stay closed. The
 * shared canvas fills the central pane behind a CSS grid of view cells;
 * each view renders its scissored rectangle. This page is the reference
 * consumer of the multi-view API: addView + geometry slice + per-view clip
 * planes.
 */
@Component({
  selector: 'app-split-window',
  imports: [
    MatIcon,
    MatIconButton,
    MatTooltip,
    MatProgressSpinner,
    FirebirdShellComponent,
    EventSelectorComponent,
    GeometryClippingComponent,
    EventTimeControlComponent,
    AnimationSettingsComponent,
    PerfStatsComponent,
    RecordingMenuComponent,
    FirebirdDisplayComponent,
  ],
  templateUrl: './split-window.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './split-window.component.scss',
})
export class SplitWindowComponent implements OnDestroy {
  /** The `<firebird-display>` element: the shared canvas fills it, behind the view cells. */
  @ViewChild(FirebirdDisplayComponent, { read: ElementRef }) host!: ElementRef<HTMLElement>;
  @ViewChild('cellTop') cellTop!: ElementRef<HTMLElement>;
  @ViewChild('cellSide') cellSide!: ElementRef<HTMLElement>;
  @ViewChild('cellFront') cellFront!: ElementRef<HTMLElement>;
  @ViewChild('cellMain') cellMain!: ElementRef<HTMLElement>;

  /** Views added by this page (the main view is not in this list — it stays). */
  private addedViews: RenderView[] = [];

  /** Demonstrator control panel (cut positions, tracks-on-top). */
  private gui?: GUI;
  private configSubscriptions: Subscription[] = [];

  private readonly commandBus = inject(CommandBusService);
  /** Buttons packs add to the time controls (withToolbarAction). */
  readonly toolbarActions = injectToolbarActions();

  constructor(
    public eventDisplay: EventDisplayService,
    private three: ThreeService,
    private config: ConfigService,
  ) {}

  /** Dispatches a toolbar action's command; a failure reaches the user's error channel. */
  runToolbarAction(action: ToolbarActionRegistration): void {
    this.commandBus.dispatch({ ...action.command, source: 'ui' })
      .catch(error => this.eventDisplay.reportError(
        `Command '${action.command.type}' failed: ${error instanceof Error ? error.message : error}`));
  }

  /** Loading indicators shared with the display page (service-owned). */
  get loadingDex() { return this.eventDisplay.loadingDex; }
  get loadingEdm() { return this.eventDisplay.loadingEdm; }
  get loadingGeometry() { return this.eventDisplay.loadingGeometry; }

  /**
   * The display is attached to `<firebird-display>`, before the configured
   * sources load: move the main view into its cell and add the projection
   * views. Revisits re-attach the existing scene the same way.
   */
  onDisplayAttached(): void {
    this.three.setMainViewContainer(this.cellMain.nativeElement);

    // The projection views' geometry copy. Empty until geometry loads:
    // EventDisplayService rebuilds it after every geometry load.
    const slice = this.three.createGeometrySlice();

    // Orthographic projections in the standard frame: beam along Z pointing
    // right on screen. Each clip plane removes the geometry half between the
    // camera and the cut, so the view shows the cross-section (visible side
    // of a plane is normal·p + constant >= 0). Initial visible height fits
    // the whole detector. A view created with `geometrySlice` renders the
    // slice copy instead of the original geometry.
    const orthoHeight = 15000;
    this.addedViews = [
      this.three.addView({
        name: 'top',
        container: this.cellTop.nativeElement,
        orthographic: true,
        orthoWorldHeight: orthoHeight,
        fixedDirection: { direction: [0, 1, 0], up: [1, 0, 0] },
        geometrySlice: slice,
        clipPlane: { normal: [0, -1, 0], constant: 0 }, // keep y <= 0
        tracksOnTop: true,
      }),
      this.three.addView({
        name: 'side',
        container: this.cellSide.nativeElement,
        orthographic: true,
        orthoWorldHeight: orthoHeight,
        fixedDirection: { direction: [-1, 0, 0], up: [0, 1, 0] },
        geometrySlice: slice,
        clipPlane: { normal: [1, 0, 0], constant: 0 }, // keep x >= 0
        tracksOnTop: true,
      }),
      this.three.addView({
        name: 'front',
        container: this.cellFront.nativeElement,
        orthographic: true,
        orthoWorldHeight: orthoHeight,
        fixedDirection: { direction: [0, 0, 1], up: [0, 1, 0] },
        geometrySlice: slice,
        clipPlane: { normal: [0, 0, -1], constant: 0 }, // keep z <= cut position
        tracksOnTop: true,
      }),
    ];

    this.setupDemoControls();
  }

  ngOnDestroy(): void {
    // <firebird-display> detached the display already (child before parent)
    for (const subscription of this.configSubscriptions) {
      subscription.unsubscribe();
    }
    this.configSubscriptions = [];
    this.gui?.destroy();
    this.gui = undefined;
    for (const view of this.addedViews) {
      this.three.removeView(view);
    }
    this.addedViews = [];
    // Restores single-copy layer routing for the display page.
    this.three.removeGeometrySlice();
  }

  /**
   * The demonstrator control panel (lil-gui): per-view cut positions and
   * tracks-on-top toggles. Every control is backed by a declared config key,
   * so the same state is deep-linkable and scriptable like any other setting
   * (`?config.quadView.front.clipPos=1500`) and survives reloads; the GUI is
   * one writer among many, not the source of truth.
   */
  private setupDemoControls(): void {
    const viewByName = (name: string) => name === 'main'
      ? this.three.mainView
      : this.addedViews.find(view => view.name === name);

    this.gui = new GUI({ container: this.host.nativeElement, title: 'Quad view' });
    const guiRoot = this.gui.domElement;
    guiRoot.style.position = 'absolute';
    guiRoot.style.top = '8px';
    guiRoot.style.right = '8px';
    guiRoot.style.zIndex = '3';

    const state: Record<string, number | boolean> = {};

    // Cut positions [mm]. Each view's plane keeps its fixed normal; the
    // position moves the cut along that normal's axis (see the addView
    // calls for the keep-side conventions).
    const cuts = this.gui.addFolder('Cut position [mm]');
    const cutDefs: Array<{ key: string; view: string; label: string; toConstant: (pos: number) => number }> = [
      { key: 'quadView.top.clipPos',   view: 'top',   label: 'Top cut (y)',   toConstant: pos => pos },
      { key: 'quadView.side.clipPos',  view: 'side',  label: 'Side cut (x)',  toConstant: pos => -pos },
      { key: 'quadView.front.clipPos', view: 'front', label: 'Front cut (z)', toConstant: pos => pos },
    ];
    for (const def of cutDefs) {
      const property = this.config.getConfigOrCreate<number>(def.key, 0);
      state[def.key] = property.value;
      const controller = cuts.add(state, def.key, -5000, 5000, 10).name(def.label)
        .onChange((value: number) => { property.value = value; });
      this.configSubscriptions.push(property.subject.subscribe(value => {
        const view = viewByName(def.view);
        if (view?.clipPlane) {
          view.clipPlane.constant = def.toConstant(value);
          view.dirty = true; // render-on-demand: schedule a frame
        }
        if (state[def.key] !== value) { state[def.key] = value; controller.updateDisplay(); }
      }));
    }

    // Tracks-on-top: event data drawn over geometry regardless of depth.
    // Defaults: ON for the projection views, OFF for the 3D view.
    const tracks = this.gui.addFolder('Tracks on top');
    const trackDefs: Array<{ key: string; view: string; label: string; initial: boolean }> = [
      { key: 'quadView.top.tracksOnTop',   view: 'top',   label: 'Top',   initial: true },
      { key: 'quadView.side.tracksOnTop',  view: 'side',  label: 'Side',  initial: true },
      { key: 'quadView.front.tracksOnTop', view: 'front', label: 'Front', initial: true },
      { key: 'quadView.main.tracksOnTop',  view: 'main',  label: '3D',    initial: false },
    ];
    for (const def of trackDefs) {
      const property = this.config.getConfigOrCreate<boolean>(def.key, def.initial);
      state[def.key] = property.value;
      const controller = tracks.add(state, def.key).name(def.label)
        .onChange((value: boolean) => { property.value = value; });
      this.configSubscriptions.push(property.subject.subscribe(value => {
        const view = viewByName(def.view);
        if (view) {
          view.tracksOnTop = value;
          view.dirty = true; // render-on-demand: schedule a frame
        }
        if (state[def.key] !== value) { state[def.key] = value; controller.updateDisplay(); }
      }));
    }
  }
}
