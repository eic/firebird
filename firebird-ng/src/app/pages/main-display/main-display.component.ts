import {
  Component,
  OnInit,
  AfterViewInit,
  Input,
  ViewChild, OnDestroy, TemplateRef, ElementRef, signal
} from '@angular/core';

import {ALL_GROUPS, GeometryService} from '../../services/geometry.service';
import {GameControllerService} from '../../services/game-controller.service';
import {ConfigService} from '../../services/config.service';

import {SceneTreeComponent} from '../../components/scene-tree/scene-tree.component';
import {ShellComponent} from '../../components/shell/shell.component';
import {ToolPanelComponent} from '../../components/tool-panel/tool-panel.component';
import {EventSelectorComponent} from '../../components/event-selector/event-selector.component';
import {GeometryClippingComponent} from '../../components/geometry-clipping/geometry-clipping.component';
import {PhoenixThreeFacade} from "../../utils/phoenix-three-facade";

import {MatSnackBar} from '@angular/material/snack-bar';
import {MatIcon} from '@angular/material/icon';
import { MatIconButton} from '@angular/material/button';
import {MatTooltip} from '@angular/material/tooltip';
import {EventDisplay} from "phoenix-event-display";

import {PerfStatsComponent} from "../../components/perf-stats/perf-stats.component";
import {EventDisplayService} from "../../services/event-display.service";
import {EventTimeControlComponent} from "../../components/event-time-control/event-time-control.component";
import {ServerConfigService} from "../../services/server-config.service";
import {CubeViewportControlComponent} from "../../components/cube-viewport-control/cube-viewport-control.component";
import {LegendWindowComponent} from "../../components/legend-window/legend-window.component";
import {PainterConfigPageComponent} from "../../services/configurator/painter-config-page.component";
import {NgIf} from "@angular/common";
import {TrackPainterConfig} from "../../services/track-painter-config";
import {ObjectRaycastComponent} from "../../components/object-raycast/object-raycast.component";
import {MatProgressSpinner} from "@angular/material/progress-spinner";
import {SceneExportComponent} from "../../components/scene-export/scene-export";
import GUI from 'lil-gui';
import {ConfigProperty} from "../../utils/config-property";
import JSZip from 'jszip';



/**
 * This MainDisplayComponent:
 *  - Initializes and uses ThreeService (which sets up scene, camera, controls, etc.).
 *  - Loads geometry via GeometryService, attaches it to scene.
 *  - Loads event data (Dex or custom) via DataModelService, builds objects in "EventData" group.
 *  - Uses EicAnimationsManager for collisions/expansions.
 *  - Has leftover UI logic for sliders, time stepping, left/right pane toggling, etc.
 *  - Has *no* references to phoenix-event-display or eventDisplay.
 */
@Component({
  selector: 'app-main-display',
  templateUrl: './main-display.component.html',
  styleUrls: ['./main-display.component.scss'],
  imports: [
    MatIcon,
    MatTooltip,
    MatIconButton,
    SceneTreeComponent,
    ShellComponent,
    ToolPanelComponent,
    EventSelectorComponent,
    GeometryClippingComponent,
    PerfStatsComponent,
    EventTimeControlComponent,
    CubeViewportControlComponent,
    LegendWindowComponent,
    PainterConfigPageComponent,
    NgIf,
    ObjectRaycastComponent,
    MatProgressSpinner,
    SceneExportComponent,
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
  @ViewChild(ShellComponent)
  displayShellComponent!: ShellComponent;

  @ViewChild(SceneTreeComponent)
  geometryTreeComponent: SceneTreeComponent | null | undefined;

  @ViewChild(CubeViewportControlComponent)
  private cubeControl!: CubeViewportControlComponent;

  geometryUrl = new ConfigProperty('geometry.selectedGeometry', 'https://eic.github.io/epic/artifacts/tgeo/epic_craterlake.root');
  geometryFastAndUgly = new ConfigProperty('geometry.FastDefaultMaterial', false);
  geometryCutListName = new ConfigProperty('geometry.cutListName', "off");
  dexJsonEventSource = new ConfigProperty('events.dexEventsSource', '');
  rootEventSource = new ConfigProperty('events.rootEventSource', '');
  rootEventRange = new ConfigProperty('events.rootEventRange', '0-5');

  message = "";

  loaded: boolean = false;

  // The geometry group switching index, used in cycleGeometry()
  private geometryGroupSwitchingIndex = ALL_GROUPS.length;
  currentGeometry: string = 'All';

  // UI toggles
  isLeftPaneOpen: boolean = false;
  isRightPaneOpen: boolean = false;

  // Loading indicators
  loadingDex     = signal(false);
  loadingEdm     = signal(false);
  loadingGeometry = signal(false);

  // lil GUI for right panel
  lilGui = new GUI();
  showGui = false;

  // video recording
  offlineRecording = signal(false);
  offlineProgress = signal('');
  private offlineAbort: AbortController | null = null;
  capturedFrames: Blob[] = [];

  // Phoenix API
  private facade: PhoenixThreeFacade = new PhoenixThreeFacade(new EventDisplay());

  constructor(
    private controller: GameControllerService,
    private snackBar: MatSnackBar,
    public  eventDisplay: EventDisplayService,
    private config: ConfigService,
    private serverConfig: ServerConfigService,
    public  geomService: GeometryService,
  ) {
    config.addConfig(this.geometryUrl);
    config.addConfig(this.geometryFastAndUgly);
    config.addConfig(this.geometryCutListName);
    config.addConfig(this.dexJsonEventSource);
    config.addConfig(this.rootEventSource);
    config.addConfig(this.rootEventRange);
  }


  async ngOnInit() {
    // Initialize the ThreeService scene/camera/renderer/controls
    this.eventDisplay.initThree('eventDisplay');

    // The facade will be initialized in three.service
    this.facade.initializeScene()


    this.controller.buttonY.onPress.subscribe((value) => {
      if (value) {
        // TODO this.cycleGeometry();
      }
    });
  }


  // 2) AFTER VIEW INIT => handle resizing with DisplayShell or window
  ngAfterViewInit(): void {

    if (this.isAutoLoadOnInit) {
      // Load JSON based data files
      this.initDexEventSource();

      // Load Root file based data files
      this.initRootData();
    }

    if (this.displayShellComponent) {
      const resizeInvoker = () => {
        setTimeout(() => {
          this.onRendererElementResize();
        }, 100);
      };
      this.displayShellComponent.onVisibilityChangeLeft.subscribe(resizeInvoker);
      this.displayShellComponent.onVisibilityChangeRight.subscribe(resizeInvoker);
      this.displayShellComponent.onEndResizeLeft.subscribe(() => this.onRendererElementResize());
      this.displayShellComponent.onEndResizeRight.subscribe(() => this.onRendererElementResize());
    }

    this.initCubeViewportControl();

    window.addEventListener('resize', () => {
      this.onRendererElementResize();
    });

    // When sidebar is collapsed/opened, the main container, i.e. #eventDisplay offsetWidth is not yet updated.
    // This leads to a not proper resize  processing. We add 100ms delay before calling a function
    const this_obj = this;
    const resizeInvoker = function () {
      setTimeout(() => {
        this_obj.onRendererElementResize();
      }, 100);  // 100 milliseconds = 0.1 seconds
    };
    resizeInvoker();

    // Loads the geometry (do it last as it might be long)
    if (this.isAutoLoadOnInit) {
      this.initGeometry();
    }

    // Init gui
    this.lilGui.add(this.eventDisplay.three.perspectiveCamera.position, 'x').name('Camera x[mm]').decimals(2).listen();
    this.lilGui.add(this.eventDisplay.three.perspectiveCamera.position, 'y').name('Camera y[mm]').decimals(2).listen();
    this.lilGui.add(this.eventDisplay.three.perspectiveCamera.position, 'z').name('Camera z[mm]').decimals(2).listen();

    this.lilGui.add(this.eventDisplay.three.controls.target, 'x').name("Pivot x[mm]").decimals(1).listen();
    this.lilGui.add(this.eventDisplay.three.controls.target, 'y').name("Pivot y[mm]").decimals(1).listen();
    this.lilGui.add(this.eventDisplay.three.controls.target, 'z').name("Pivot z[mm]").decimals(1).listen();

    this.lilGui.add(this, 'testButton').name('Camera to center');

    this.lilGui.add(this.eventDisplay.three, "showBVHDebug");

    // GUI settings
    this.lilGui.domElement.style.top = '64px';
    this.lilGui.domElement.style.right = '120px';
    this.lilGui.domElement.style.display = 'none';

    this.mediaSource.addEventListener('sourceopen', this.handleSourceOpen, false);

    this.lilGui.add(this, 'startRecording').name('Start recording');
    this.lilGui.add(this, 'stopRecording').name('Stop recording');
    this.lilGui.add(this, 'download').name('Download recording');
    // Offline 4K capture controls
    const captureFolder = this.lilGui.addFolder('4K Capture');
    captureFolder.add(this, 'startOfflineRecording').name('▶ Start Capture');
    captureFolder.add(this, 'stopOfflineRecording').name('⏹ Stop');
    captureFolder.add(this, 'downloadFrames').name('💾 Download Frames');

  }

  // 3) UI - Toggling panes
  toggleLeftPane() {
    this.displayShellComponent?.toggleLeftPane();
    this.isLeftPaneOpen = !this.isLeftPaneOpen;
  }

  toggleRightPane() {
    this.displayShellComponent?.toggleRightPane();
    this.isRightPaneOpen = !this.isRightPaneOpen;
  }

  // 4) Method to initialize CubeViewportControl with the existing Three.js objects
  private initCubeViewportControl(): void {
    const {scene, camera, renderer} = this.eventDisplay.three;
    if (this.cubeControl && scene && camera && renderer) {
      // Pass the external scene, camera, and renderer to the cube control
      this.cubeControl.initWithExternalScene(scene, camera, renderer);
      this.cubeControl.gizmo.attachControls(this.eventDisplay.three.controls);
      this.cubeControl.gizmo.camera
    }

    const thisPointer = this;
    this.eventDisplay.three.addFrameCallback(() => {
      if (thisPointer.cubeControl?.gizmo) {
        thisPointer.cubeControl.gizmo.render();
      }
    });
  }


  showError(message: string) {
    this.snackBar.open(message, 'Dismiss', {
      duration: 7000, // Auto-dismiss after X ms
      // verticalPosition: 'top', // Place at the top of the screen
      panelClass: ['error-snackbar']
    });
  }


  ngOnDestroy(): void {
    // Clear the custom controls when leaving the page
  }


  // Called when we want to recalculate the size of the canvas
  private onRendererElementResize() {
    let {width, height} = this.displayShellComponent.getMainAreaVisibleDimensions();
    console.log(`[RendererResize] New size: ${width}x${height} px`);

    // Delegate resizing to ThreeService
    this.eventDisplay.three.setSize(width, height);
    if (this.cubeControl?.gizmo) {
      this.cubeControl.gizmo.update();
    }
  }

  // 10) SCENE TREE / UI
  private updateSceneTreeComponent() {
    // Example: rename lights
    const scene = this.eventDisplay.three.scene;
    if (this.geometryTreeComponent) {
      this.geometryTreeComponent.refreshSceneTree();
    }
  }

  onDebugButton() {
    this.showGui = !this.showGui;

    // Toggle GUI visibility
    const guiElement = this.lilGui.domElement;
    if (this.showGui) {
      guiElement.style.display = 'block';
    } else {
      guiElement.style.display = 'none';
    }
  }

  toggleAnimationCycling() {
    if (this.eventDisplay.animationIsCycling()) {
      this.eventDisplay.stopAnimationCycling();
    } else {
      this.eventDisplay.startAnimationCycling();
    }
  }


  selectedConfigItem: any = null;

  onConfigureItemClicked(type: string) {
    if (type === 'track') {
      this.selectedConfigItem = {
        name: 'Track A',
        type: 'track',
        config: new TrackPainterConfig()
      };
    }

    this.toggleRightPane();
  }

  private initDexEventSource() {

    // We set loadingDex=false to be safe
    this.loadingDex.set(false);

    let dexUrl = this.config.getConfig<string>('events.dexEventsSource')?.value;

    if (!dexUrl || dexUrl.trim().length === 0) {
      console.log("[main-display]: No event data source specified. Skip loadDexData.");
    }
    // Check if we have the same data
    else if (this.eventDisplay.lastLoadedDexUrl === dexUrl) {
      console.log(`[main-display]: Event data (DEX) url is the same as before: '${dexUrl}', skip loading.`);
    }
    // Try to load
    else {
      this.loadingDex.set(true);
      this.eventDisplay.loadDexData(dexUrl).catch(error => {
        const msg = `Error loading events: ${error}`;
        console.error(`[main-display]: ${msg}`);
        this.showError(msg);
      }).then(() => {
        console.log("[main-display]: Event data loaded.");
        this.updateSceneTreeComponent();
      }).finally(()=>{
        this.loadingDex.set(false);   // switch off loading indicator
      });
    }
  }


  private initRootData() {
    let url = (
      this.config.getConfig<string>('events.rootEventSource')
      ?? this.config.createConfig('events.rootEventSource', '')
    ).subject.getValue();

    let eventRange = (
      this.config.getConfig<string>('events.rootEventRange')
      ?? this.config.createConfig('events.rootEventRange', '')
    ).subject.getValue();


    // Do we have url?
    if (!url || url.trim().length === 0) {
      console.log("[main-display]: No Edm4Eic source specified. Nothing to load");
      return;
    }

    // Do we have event Range?
    if (!eventRange || eventRange.trim().length === 0) {
      console.log("[main-display]: Event Range specified. Trying '0', to load the first event");
      eventRange = "0";
    }

    // Check if we have the same data
    if (this.eventDisplay.lastLoadedRootUrl === url && this.eventDisplay.lastLoadedRootEventRange === eventRange) {
      console.log(`[main-display]: Edm url is the same as before: '${url}', eventRange: '${eventRange}' - skip loading.`);
      return;
    }

    // Try to load
    else {
      this.loadingEdm.set(true);
      this.eventDisplay.loadRootData(url, eventRange).catch(error => {
        const msg = `Error loading events: ${error}`;
        console.error(`[main-display]: ${msg}`);
        this.showError(msg);
      }).then(() => {
        console.log("[main-display]: Event data loaded.");
        this.updateSceneTreeComponent();
      }).finally(()=>{
        this.loadingEdm.set(false);   // switch off loading indicator
      });
    }
  }


  /**
   * Cancel any ongoing geometry loading operation
   */
  cancelGeometryLoading(): void {
    if (this.geomService.isLoading()) {
      console.log("[main-display]: Cancelling geometry loading...");
      this.geomService.cancelLoading();
    }
  }

  private initGeometry() {
    const url = (this.config.getConfigOrCreate<string>('geometry.selectedGeometry', '')).value;

    if (!url || url.trim().length === 0) {
      console.log("[main-display]: No geometry specified. Skip loadGeometry ");
      return;
    }

    if (this.eventDisplay.lastLoadedGeometryUrl === url) {
      console.log(`[main-display]: Geometry url is the same as before: '${url}', skip loading`);
      return;
    }

    // Cancel any existing geometry load before starting a new one
    this.cancelGeometryLoading();

    this.loadingGeometry.set(true);
    this.eventDisplay.loadGeometry(url)
      .then((result) => {
        // Only update UI if geometry was actually loaded (not cancelled)
        if (result !== undefined) {
          this.updateSceneTreeComponent();
          console.log("[main-display]: Geometry loaded");
        } else {
          console.log("[main-display]: Geometry loading was cancelled");
        }
      })
      .catch(error => {
        const msg = `Error loading geometry: ${error}`;
        console.error(`[main-display]: ${msg}`);
        this.showError("Error loading Geometry. Open 'Configure' to change. Press F12->Console for logs");
      })
      .finally(() => this.loadingGeometry.set(false));
  }


  animateWithCollision() {
    this.eventDisplay.animateWithCollision();
  }

  testButton() {
    window.alert("hoho");
  }

  mediaSource = new MediaSource();

  mediaRecorder?: MediaRecorder;
  recordedBlobs = [];
  sourceBuffer!:SourceBuffer;
  originalSize?:{width:number, height:number}|null;


  handleSourceOpen(event: any) {
    console.log('MediaSource opened');
    this.sourceBuffer = this.mediaSource.addSourceBuffer('video/webm; codecs="vp8"');
    console.log('Source buffer: ', this.sourceBuffer);
  }

  handleDataAvailable(event:any) {
    if (event.data && event.data.size > 0) {
      // @ts-ignore
      this.recordedBlobs.push(event.data);
    }
  }

  handleStop(event: any) {
    console.log('Recorder stopped: ', event);
    const superBuffer = new Blob(this.recordedBlobs, {type: 'video/webm'});

  }

  startRecording() {
    // Save current size so we can restore later

    const stream = this.eventDisplay.three.renderer.domElement.captureStream(60);
    this.recordedBlobs = [];

    const optionsList = [
      { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 200_000_000 },  // 200 Mbps for 4K
      { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 200_000_000 },
      { mimeType: 'video/webm', videoBitsPerSecond: 200_000_000 },
    ];

    let recorder: MediaRecorder | null = null;
    for (const options of optionsList) {
      if (MediaRecorder.isTypeSupported(options.mimeType)) {
        try {
          recorder = new MediaRecorder(stream, options);
          console.log('Created MediaRecorder with', options);
          break;
        } catch (e) {
          console.warn('Failed with options', options, e);
        }
      }
    }

    if (!recorder) {
      alert('MediaRecorder is not supported by this browser.');
      return;
    }

    this.mediaRecorder = recorder;
    this.mediaRecorder.onstop = (event) => this.handleStop(event);
    this.mediaRecorder.ondataavailable = (event) => this.handleDataAvailable(event);
    this.mediaRecorder.start(100);
  }

  stopRecording() {
    this.mediaRecorder?.stop();
    console.log('Recorded Blobs: ', this.recordedBlobs);
  }




  download() {
    const blob = new Blob(this.recordedBlobs, {type: 'video/webm'});
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'test.webm';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  async startOfflineRecording() {
    if (this.offlineRecording()) return;
    this.offlineRecording.set(true);
    this.offlineProgress.set('Preparing...');

    this.offlineAbort = new AbortController();
    let frames: Blob[] = [];

    try {
      frames = await this.eventDisplay.captureFramesOffline({
        width: 3840,
        height: 2160,
        eventTimeStep: 0.1,
        includeCollision: true,
        signal: this.offlineAbort.signal,
        onProgress: (current, total) => {
          if (total > 0) {
            this.offlineProgress.set(`Frame ${current} / ${total}`);
          } else {
            this.offlineProgress.set(`Frame ${current} (collision phase)`);
          }
        },
      });

      if (this.offlineAbort.signal.aborted) {
        this.offlineProgress.set(`Stopped. Captured ${frames.length} frames.`);
      }
    } catch (err) {
      console.error('Offline recording failed:', err);
      this.showError(`Offline recording failed: ${err}`);
      this.offlineRecording.set(false);
      return;
    }

    // Store frames so we can download later even after stopping
    this.capturedFrames = frames;
    this.offlineRecording.set(false);

    if (frames.length > 0) {
      this.offlineProgress.set(`${frames.length} frames ready. Use "Download frames" button.`);
    }
  }

  stopOfflineRecording() {
    this.offlineAbort?.abort();
  }

  async downloadFrames() {
    if (this.capturedFrames.length === 0) {
      this.showError('No frames captured yet.');
      return;
    }

    this.offlineProgress.set(`Packing ${this.capturedFrames.length} frames...`);

    const zip = new JSZip();
    const folder = zip.folder('frames')!;
    for (let i = 0; i < this.capturedFrames.length; i++) {
      folder.file(`frame_${String(i).padStart(6, '0')}.png`, this.capturedFrames[i]);
    }

    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'STORE' },
      (meta) => this.offlineProgress.set(`Zipping: ${meta.percent.toFixed(0)}%`)
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frames_4k.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    this.offlineProgress.set(`Done! Downloaded ${this.capturedFrames.length} frames.`);
  }
}
