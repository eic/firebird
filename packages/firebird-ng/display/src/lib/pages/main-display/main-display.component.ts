import {
  Component,
  OnInit,
  Input,
  ViewChild, OnDestroy, TemplateRef, signal, effect,
  ChangeDetectionStrategy, DestroyRef, inject
} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';

import {GeometryService} from '../../services/geometry.service';
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
import {CommandBusService} from '@dexvis/app-features';
import {DataModelService} from "../../services/data-model.service";
import {RecordingMenuComponent} from "../../components/recording-menu/recording-menu.component";
import {FirebirdDisplayComponent} from "../../components/firebird-display/firebird-display.component";
import {ToolbarActionRegistration, injectCameraPresets, injectToolbarActions} from "@dexvis/firebird-ng/api";



/**
 * The display page: `<firebird-display>` in the Firebird shell, with the
 * toolbar (event selector, data selector, clipping, export, recording), the
 * model and scene trees, the painter panel, the time controls with the
 * toolbar actions packs contribute (withToolbarAction), and the camera debug
 * panel (lil-gui).
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
    FirebirdDisplayComponent,
  ]
})
export class MainDisplayComponent implements OnInit, OnDestroy {
  /** Load the configured geometry and events on attach; false runs only the startup commands. */
  @Input() isAutoLoadOnInit = true;

  @Input()
  eventDataImportOptions: string[] = []; // example, if you used them in UI

  @ViewChild('displayHeaderControls', {static: true})
  displayHeaderControls!: TemplateRef<any>;

  // For referencing child components
  @ViewChild(FirebirdShellComponent)
  displayShellComponent!: FirebirdShellComponent;

  @ViewChild(SceneTreeComponent)
  geometryTreeComponent: SceneTreeComponent | null | undefined;

  message = "";

  loaded: boolean = false;

  currentGeometry: string = 'All';

  // UI toggles: two-way bound to the shell layout panes; the shell's own
  // toolbar toggle buttons update these too.
  leftPaneOpen = signal(false);
  rightPaneOpen = signal(false);

  /** Left pane content: physics model tree, or the raw scene tree (debug). */
  leftTreeMode = signal<'model' | 'scene'>('model');

  // Loading indicators (service-owned so every display page shows the same state)
  get loadingDex() { return this.eventDisplay.loadingDex; }
  get loadingEdm() { return this.eventDisplay.loadingEdm; }
  get loadingGeometry() { return this.eventDisplay.loadingGeometry; }

  /** Camera debug panel (lil-gui), built once the scene exists and destroyed with the page. */
  private lilGui?: GUI;
  showGui = false;

  private readonly destroyRef = inject(DestroyRef);

  private readonly commandBus = inject(CommandBusService);
  /** Buttons packs add to the time controls (withToolbarAction). */
  readonly toolbarActions = injectToolbarActions();
  /** Camera presets for the debug panel's buttons. */
  private readonly cameraPresets = injectCameraPresets();

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


  /**
   * The display is attached to `<firebird-display>`: the scene exists, so
   * the camera debug panel can bind to it.
   */
  onDisplayAttached(): void {
    // Camera debug panel. It sits in document.body and its .listen()
    // controllers poll every animation frame, so ngOnDestroy destroys it.
    const gui = new GUI();
    this.lilGui = gui;
    // One button per registered camera preset, through the command bus like
    // every other camera move
    for (const preset of this.cameraPresets) {
      const button = {go: () => this.runCommand({type: 'camera-preset', name: preset.name})};
      gui.add(button, 'go').name(`Camera to ${preset.label ?? preset.name}`);
    }
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
    this.lilGui?.destroy();
    this.lilGui = undefined;
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

  runToolbarAction(action: ToolbarActionRegistration) {
    this.runCommand(action.command);
  }

  /** Dispatches a UI command; a failure reaches the user's error channel. */
  private runCommand(command: {type: string, [key: string]: unknown}) {
    this.commandBus.dispatch({...command, source: 'ui'})
      .catch(error => this.eventDisplay.reportError(
        `Command '${command.type}' failed: ${error instanceof Error ? error.message : error}`));
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
