import {
  Component,
  OnInit,
  AfterViewInit,
  Input,
  ViewChild, OnDestroy, TemplateRef, ElementRef, signal, effect,
  ChangeDetectionStrategy, DestroyRef, inject
} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';

import {ALL_GROUPS, GeometryService} from '../../services/geometry.service';
import {GameControllerService} from '../../services/game-controller.service';

import {SceneTreeComponent} from '../../components/scene-tree/scene-tree.component';
import {ModelTreeComponent} from '../../components/model-tree/model-tree.component';
import {FirebirdShellComponent} from '../../components/firebird-shell/firebird-shell.component';
import {ToolPanelComponent} from '../../components/tool-panel/tool-panel.component';
import {EventSelectorComponent} from '../../components/event-selector/event-selector.component';
import {GeometryClippingComponent} from '../../components/geometry-clipping/geometry-clipping.component';
import {OpenEventComponent} from '../../components/open-event/open-event.component';

import {MatIcon} from '@angular/material/icon';
import { MatIconButton} from '@angular/material/button';
import {MatTooltip} from '@angular/material/tooltip';

import {PerfStatsComponent} from "../../components/perf-stats/perf-stats.component";
import {EventDisplayService} from "../../services/event-display.service";
import {EventTimeControlComponent} from "../../components/event-time-control/event-time-control.component";
import {LegendWindowComponent} from "../../components/legend-window/legend-window.component";
import {PainterConfigPanelComponent} from "../../components/painter-config-panel/painter-config-panel.component";
import {ObjectRaycastComponent} from "../../components/object-raycast/object-raycast.component";
import {MatProgressSpinner} from "@angular/material/progress-spinner";
import {SceneExportComponent} from "../../components/scene-export/scene-export";
import {AnimationSettingsComponent} from "../../components/animation-settings/animation-settings.component";
import GUI from 'lil-gui';
import {DataModelService} from "../../services/data-model.service";
import {RecordingMenuComponent} from "../../components/recording-menu/recording-menu.component";



/**
 * This MainDisplayComponent:
 *  - Initializes and uses ThreeService (which sets up scene, camera, controls, etc.).
 *  - Loads geometry via GeometryService, attaches it to scene.
 *  - Loads event data (Dex or custom) via DataModelService, builds objects in "EventData" group.
 *  - Uses EicAnimationsManager for collisions/expansions.
 *  - Has leftover UI logic for sliders, time stepping, left/right pane toggling, etc.
 */
@Component({
  selector: 'app-main-display',
  templateUrl: './main-display.component.html',
  styleUrls: ['./main-display.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIcon,
    MatTooltip,
    MatIconButton,
    SceneTreeComponent,
    ModelTreeComponent,
    FirebirdShellComponent,
    ToolPanelComponent,
    EventSelectorComponent,
    OpenEventComponent,
    GeometryClippingComponent,
    PerfStatsComponent,
    EventTimeControlComponent,
    LegendWindowComponent,
    PainterConfigPanelComponent,
    ObjectRaycastComponent,
    MatProgressSpinner,
    SceneExportComponent,
    AnimationSettingsComponent,
    RecordingMenuComponent,
  ]
})
export class MainDisplayComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Automatically load geometry and event data on init (set to false for tests) */
  @Input() isAutoLoadOnInit = true;

  @Input()
  eventDataImportOptions: string[] = []; // example, if you used them in UI

  @ViewChild('displayHeaderControls', {static: true})
  displayHeaderControls!: TemplateRef<any>;

  @ViewChild('eventDisplay')
  eventDisplayDiv!: ElementRef;

  // For referencing child components
  @ViewChild(FirebirdShellComponent)
  displayShellComponent!: FirebirdShellComponent;

  /** Central pane container: its size is layout-driven (panes, window), so the
   * ResizeObserver on it never feeds back from the canvas size. */
  @ViewChild('centralContainer')
  centralContainer!: ElementRef<HTMLElement>;

  @ViewChild(SceneTreeComponent)
  geometryTreeComponent: SceneTreeComponent | null | undefined;

  message = "";

  loaded: boolean = false;

  // The geometry group switching index, used in cycleGeometry()
  private geometryGroupSwitchingIndex = ALL_GROUPS.length;
  currentGeometry: string = 'All';

  // UI toggles: two-way bound to the shell layout panes; the shell's own
  // toolbar toggle buttons update these too.
  leftPaneOpen = signal(false);
  rightPaneOpen = signal(false);

  /** Left pane content: physics model tree, or the raw scene tree (debug). */
  leftTreeMode = signal<'model' | 'scene'>('model');

  private resizeObserver?: ResizeObserver;
  private resizeDebounce?: ReturnType<typeof setTimeout>;

  // Loading indicators (service-owned so every display page shows the same state)
  get loadingDex() { return this.eventDisplay.loadingDex; }
  get loadingEdm() { return this.eventDisplay.loadingEdm; }
  get loadingGeometry() { return this.eventDisplay.loadingGeometry; }

  /** Camera debug panel (lil-gui), built once the scene exists and destroyed with the page. */
  private lilGui?: GUI;
  showGui = false;

  /** Set in ngOnDestroy: setup that resumes after an await checks it and stops. */
  private destroyed = false;
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private controller: GameControllerService,
    public  eventDisplay: EventDisplayService,
    public  geomService: GeometryService,
    private dataService: DataModelService,
  ) {
    // Scene-tree debug view refresh on data arrival. Signal-driven so it
    // also covers command-driven loads (?dex=/?geometry=), which the old
    // per-load callbacks missed.
    effect(() => {
      this.geomService.geometry();
      this.updateSceneTreeComponent();
    });
    effect(() => {
      this.dataService.currentEntry();
      this.updateSceneTreeComponent();
    });
  }


  ngOnInit() {
    // The controller service is a root singleton: the subscription ends with
    // the page, or every visit would add one.
    this.controller.buttonY.onPress.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      if (value) {
        // TODO this.cycleGeometry();
      }
    });
  }


  // 2) AFTER VIEW INIT => handle resizing with DisplayShell or window
  async ngAfterViewInit(): Promise<void> {

    // Initialize the ThreeService scene/camera/renderer/controls
    // Must happen in ngAfterViewInit so the DOM container #eventDisplay exists.
    // False: the page went away (or another display page attached) while
    // the renderer initialized, so nothing below may run.
    const attached = await this.eventDisplay.initThree('eventDisplay');
    if (!attached || this.destroyed) {
      return;
    }

    // One mechanism for every resize source (pane toggle, pane drag, window):
    // observe the central pane container. Debounced because pane dragging
    // fires per animation frame.
    this.resizeObserver = new ResizeObserver(() => {
      clearTimeout(this.resizeDebounce);
      this.resizeDebounce = setTimeout(() => this.onRendererElementResize(), 50);
    });
    this.resizeObserver.observe(this.centralContainer.nativeElement);
    this.onRendererElementResize();

    // Config-driven auto-load + the queued startup commands (?dex=&event=N,
    // server startupCommands, batch) — one shared path with the quad view.
    // Failures reach the user through EventDisplayService.reportError().
    if (this.isAutoLoadOnInit) {
      this.eventDisplay.autoLoadAndRunStartup();
    } else {
      void this.eventDisplay.runStartupCommands();
    }

    // Camera debug panel. It sits in document.body and its .listen()
    // controllers poll every animation frame, so ngOnDestroy destroys it.
    const gui = new GUI();
    this.lilGui = gui;
    gui.add(this, 'cameraToCenter').name('Camera to center');
    gui.add(this, 'cameraToFarForward').name('Camera to Far Forward');
    gui.add(this, 'makeScreenshot').name('Make Screenshot');

    gui.add(this.eventDisplay.three.perspectiveCamera.position, 'x').name('Camera x[mm]').decimals(2).listen();
    gui.add(this.eventDisplay.three.perspectiveCamera.position, 'y').name('Camera y[mm]').decimals(2).listen();
    gui.add(this.eventDisplay.three.perspectiveCamera.position, 'z').name('Camera z[mm]').decimals(2).listen();

    gui.add(this.eventDisplay.three.controls.target, 'x').name("Pivot x[mm]").decimals(1).listen();
    gui.add(this.eventDisplay.three.controls.target, 'y').name("Pivot y[mm]").decimals(1).listen();
    gui.add(this.eventDisplay.three.controls.target, 'z').name("Pivot z[mm]").decimals(1).listen();

    gui.add(this.eventDisplay.three, "showBVHDebug");

    // GUI settings
    gui.domElement.style.top = '64px';
    gui.domElement.style.right = '120px';
    gui.domElement.style.display = this.showGui ? 'block' : 'none';

    // Recording lives in the toolbar (app-recording-menu), not in this
    // debug GUI.
  }

  // 3) UI - Toggling panes
  toggleLeftPane() {
    this.leftPaneOpen.update(v => !v);
  }

  toggleRightPane() {
    this.rightPaneOpen.update(v => !v);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.lilGui?.destroy();
    this.lilGui = undefined;
    this.eventDisplay.detachDataSelection();
    this.resizeObserver?.disconnect();
    clearTimeout(this.resizeDebounce);
    // No page shows the canvas until the next display page attaches it.
    this.eventDisplay.three.detach();
  }


  // Called when we want to recalculate the size of the canvas
  private onRendererElementResize() {
    const el = this.centralContainer.nativeElement;
    const width = el.clientWidth;
    const height = el.clientHeight;
    console.log(`[RendererResize] New size: ${width}x${height} px`);

    // Delegate resizing to ThreeService
    this.eventDisplay.three.setSize(width, height);
  }

  // 10) SCENE TREE / UI
  private updateSceneTreeComponent() {
    // Example: rename lights
    const scene = this.eventDisplay.three.scene;
    if (this.geometryTreeComponent) {
      this.geometryTreeComponent.refreshSceneTree();
    }
  }

  toggleCameraControls() {
    this.showGui = !this.showGui;

    // Toggle GUI visibility (the panel exists once the scene initialized)
    if (this.lilGui) {
      this.lilGui.domElement.style.display = this.showGui ? 'block' : 'none';
    }
  }


  onConfigureItemClicked(type: string) {
    // The right pane hosts the painter panel, driven by the shared selection.
    this.rightPaneOpen.set(true);
  }

  animateWithCollision() {
    this.eventDisplay.animateWithCollision();
  }

  cameraToCenter() {
    this.eventDisplay.three.camera.position.setX(-3600);
    this.eventDisplay.three.camera.position.setY(2900);
    this.eventDisplay.three.camera.position.setZ(-4700);
    this.eventDisplay.three.controls.target.setX(0);
    this.eventDisplay.three.controls.target.setY(0);
    this.eventDisplay.three.controls.target.setZ(0);
  }

  cameraToFarForward() {
    this.eventDisplay.three.camera.position.setX(8000);
    this.eventDisplay.three.camera.position.setY(7500);
    this.eventDisplay.three.camera.position.setZ(40000);
    this.eventDisplay.three.controls.target.setX(0);
    this.eventDisplay.three.controls.target.setY(0);
    this.eventDisplay.three.controls.target.setZ(30000);
  }

  makeScreenshot() {
    const renderer = this.eventDisplay.three.renderer;
    // Render one frame to ensure the canvas is up to date
    renderer.render(this.eventDisplay.three.scene, this.eventDisplay.three.camera);
    // Use toDataURL for broad browser compatibility (works in Firefox)
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `firebird-screenshot-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

}
