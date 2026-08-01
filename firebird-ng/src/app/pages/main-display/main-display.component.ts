import {
  Component,
  OnInit,
  AfterViewInit,
  Input,
  ViewChild, OnDestroy, TemplateRef, ElementRef, signal,
  ChangeDetectionStrategy
} from '@angular/core';

import {ALL_GROUPS, GeometryService} from '../../services/geometry.service';
import {GameControllerService} from '../../services/game-controller.service';
import {ConfigService} from '../../services/config.service';

import {SceneTreeComponent} from '../../components/scene-tree/scene-tree.component';
import {FirebirdShellComponent} from '../../components/firebird-shell/firebird-shell.component';
import {ToolPanelComponent} from '../../components/tool-panel/tool-panel.component';
import {EventSelectorComponent} from '../../components/event-selector/event-selector.component';
import {GeometryClippingComponent} from '../../components/geometry-clipping/geometry-clipping.component';

import {MatSnackBar} from '@angular/material/snack-bar';
import {MatIcon} from '@angular/material/icon';
import { MatIconButton} from '@angular/material/button';
import {MatTooltip} from '@angular/material/tooltip';

import {PerfStatsComponent} from "../../components/perf-stats/perf-stats.component";
import {EventDisplayService} from "../../services/event-display.service";
import {EventTimeControlComponent} from "../../components/event-time-control/event-time-control.component";
import {ServerConfigService} from "../../services/server-config.service";
import {LegendWindowComponent} from "../../components/legend-window/legend-window.component";
import {PainterConfigPageComponent} from "../../services/configurator/painter-config-page.component";
import {NgIf} from "@angular/common";
import {TrackPainterConfig} from "../../services/track-painter-config";
import {ObjectRaycastComponent} from "../../components/object-raycast/object-raycast.component";
import {MatProgressSpinner} from "@angular/material/progress-spinner";
import {SceneExportComponent} from "../../components/scene-export/scene-export";
import {AnimationSettingsComponent} from "../../components/animation-settings/animation-settings.component";
import GUI from 'lil-gui';
import {ConfigProperty} from "../../utils/config-property";
import {CommandBusService} from "../../firebird/command-bus.service";
import JSZip from 'jszip';



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
    FirebirdShellComponent,
    ToolPanelComponent,
    EventSelectorComponent,
    GeometryClippingComponent,
    PerfStatsComponent,
    EventTimeControlComponent,
    LegendWindowComponent,
    PainterConfigPageComponent,
    NgIf,
    ObjectRaycastComponent,
    MatProgressSpinner,
    SceneExportComponent,
    AnimationSettingsComponent,
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

  // Empty default on purpose: the app-level default arrives through
  // withDefaultGeometry() in app.config (feature-defaults tier).
  geometryUrl = new ConfigProperty('geometry.selectedGeometry', '');
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

  // UI toggles: two-way bound to the shell layout panes; the shell's own
  // toolbar toggle buttons update these too.
  leftPaneOpen = signal(false);
  rightPaneOpen = signal(false);

  private resizeObserver?: ResizeObserver;
  private resizeDebounce?: ReturnType<typeof setTimeout>;

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
  captureOverrideResolution = true;
  captureWidth = 3840;
  captureHeight = 2160;


  constructor(
    private controller: GameControllerService,
    private snackBar: MatSnackBar,
    public  eventDisplay: EventDisplayService,
    private config: ConfigService,
    private serverConfig: ServerConfigService,
    public  geomService: GeometryService,
    private commandBus: CommandBusService,
  ) {
    // addConfig returns the canonical instance for the key — keep the
    // returned reference so all writers/readers share one property.
    this.geometryUrl = config.addConfig(this.geometryUrl);
    this.geometryFastAndUgly = config.addConfig(this.geometryFastAndUgly);
    this.geometryCutListName = config.addConfig(this.geometryCutListName);
    this.dexJsonEventSource = config.addConfig(this.dexJsonEventSource);
    this.rootEventSource = config.addConfig(this.rootEventSource);
    this.rootEventRange = config.addConfig(this.rootEventRange);
  }


  ngOnInit() {
    this.controller.buttonY.onPress.subscribe((value) => {
      if (value) {
        // TODO this.cycleGeometry();
      }
    });
  }


  // 2) AFTER VIEW INIT => handle resizing with DisplayShell or window
  async ngAfterViewInit(): Promise<void> {

    // Initialize the ThreeService scene/camera/renderer/controls
    // Must happen in ngAfterViewInit so the DOM container #eventDisplay exists
    await this.eventDisplay.initThree('eventDisplay');

    // Startup commands (URL deep link ?dex=&event=N, server startupCommands,
    // batch) replace the config-driven auto-load for the data they carry.
    const startupCommands = this.commandBus.peekStartupCommands();
    const startupHas = (type: string) => startupCommands.some(c => c.type === type);

    if (this.isAutoLoadOnInit && !startupHas('open-dex')) {
      // Load JSON based data files
      this.initDexEventSource();

      // Load Root file based data files
      this.initRootData();
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

    // Loads the geometry (do it last as it might be long)
    if (this.isAutoLoadOnInit && !startupHas('open-geometry')) {
      this.initGeometry();
    }

    // Scene is up — run the queued startup commands (sequential; a
    // show-event command waits internally for its data to arrive).
    void this.commandBus.runStartupCommands();

    // Init gui
    this.lilGui.add(this, 'cameraToCenter').name('Camera to center');
    this.lilGui.add(this, 'cameraToFarForward').name('Camera to Far Forward');
    this.lilGui.add(this, 'makeScreenshot').name('Make Screenshot');

    this.lilGui.add(this.eventDisplay.three.perspectiveCamera.position, 'x').name('Camera x[mm]').decimals(2).listen();
    this.lilGui.add(this.eventDisplay.three.perspectiveCamera.position, 'y').name('Camera y[mm]').decimals(2).listen();
    this.lilGui.add(this.eventDisplay.three.perspectiveCamera.position, 'z').name('Camera z[mm]').decimals(2).listen();

    this.lilGui.add(this.eventDisplay.three.controls.target, 'x').name("Pivot x[mm]").decimals(1).listen();
    this.lilGui.add(this.eventDisplay.three.controls.target, 'y').name("Pivot y[mm]").decimals(1).listen();
    this.lilGui.add(this.eventDisplay.three.controls.target, 'z').name("Pivot z[mm]").decimals(1).listen();

    this.lilGui.add(this.eventDisplay.three, "showBVHDebug");

    // GUI settings
    this.lilGui.domElement.style.top = '64px';
    this.lilGui.domElement.style.right = '120px';
    this.lilGui.domElement.style.display = 'none';

    this.mediaSource.addEventListener('sourceopen', this.handleSourceOpen, false);

    // Video Capture controls
    const videoFolder = this.lilGui.addFolder('Video Capture');
    videoFolder.close();
    videoFolder.add(this, 'startRecording').name('Start recording');
    videoFolder.add(this, 'stopRecording').name('Stop recording');
    videoFolder.add(this, 'download').name('Download recording');

    // High Resolution Capture controls
    const captureFolder = this.lilGui.addFolder('High Resolution Capture');
    captureFolder.close();
    captureFolder.add(this, 'captureOverrideResolution').name('Override resolution');
    captureFolder.add(this, 'captureWidth', 640, 7680, 1).name('Width');
    captureFolder.add(this, 'captureHeight', 360, 4320, 1).name('Height');
    captureFolder.add(this, 'startOfflineRecording').name('▶ Start Capture');
    captureFolder.add(this, 'stopOfflineRecording').name('⏹ Stop');
    captureFolder.add(this, 'downloadFrames').name('💾 Download Frames');

  }

  // 3) UI - Toggling panes
  toggleLeftPane() {
    this.leftPaneOpen.update(v => !v);
  }

  toggleRightPane() {
    this.rightPaneOpen.update(v => !v);
  }

  showError(message: string) {
    this.snackBar.open(message, 'Dismiss', {
      duration: 7000, // Auto-dismiss after X ms
      // verticalPosition: 'top', // Place at the top of the screen
      panelClass: ['error-snackbar']
    });
  }


  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    clearTimeout(this.resizeDebounce);
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

    // Toggle GUI visibility
    const guiElement = this.lilGui.domElement;
    if (this.showGui) {
      guiElement.style.display = 'block';
    } else {
      guiElement.style.display = 'none';
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
        // loadGeometry always resolves an object; `cancelled` is set when another
        // load superseded this one — nothing was added to the scene in that case.
        if (result.cancelled) {
          console.log("[main-display]: Geometry loading was cancelled");
        } else {
          this.updateSceneTreeComponent();
          console.log("[main-display]: Geometry loaded");
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
    const url = window.URL.createObjectURL(superBuffer);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'recording.webm';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
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
    this.snackBar.open('Capture may distort video in your browser. Resulting captures will be fine.', 'OK', { duration: 5000 });
    this.offlineRecording.set(true);
    this.offlineProgress.set('Preparing...');

    this.offlineAbort = new AbortController();
    let frames: Blob[] = [];

    try {
      frames = await this.eventDisplay.captureFramesOffline({
        overrideResolution: this.captureOverrideResolution,
        width: this.captureWidth,
        height: this.captureHeight,
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

    const total = this.capturedFrames.length;

    // Prefer File System Access API (Chromium) — writes each PNG directly,
    // no memory spike at all. Falls back to chunked ZIPs for Firefox/Safari.
    if ('showDirectoryPicker' in window) {
      try {
        await this.downloadFramesToDirectory(total);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return; // user cancelled picker
        console.warn('Directory picker failed, falling back to chunked ZIPs:', err);
      }
    }

    await this.downloadFramesAsChunkedZips(total);
  }

  /** Write each frame as an individual PNG into a user-chosen folder. */
  private async downloadFramesToDirectory(total: number) {
    this.offlineProgress.set('Choose a folder to save frames...');
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });

    const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));
    this.snackBar.open(`Saving ${total} frames to folder...`, undefined, { duration: 0 });

    for (let i = 0; i < total; i++) {
      const name = `frame_${String(i).padStart(6, '0')}.png`;
      const fileHandle = await dirHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(this.capturedFrames[i]);
      await writable.close();

      if (i % 10 === 0) {
        this.offlineProgress.set(`Saving frame ${i + 1} / ${total}...`);
        await yieldToUI();
      }
    }

    this.offlineProgress.set(`Done! Saved ${total} frames to folder.`);
    this.snackBar.open(`Saved ${total} frames`, 'OK', { duration: 5000 });
  }

  /**
   * Fallback: split frames into small ZIPs (~200 frames each) so no single
   * ZIP blob exceeds browser ArrayBuffer limits.
   */
  private async downloadFramesAsChunkedZips(total: number) {
    const CHUNK_SIZE = 200;
    const numChunks = Math.ceil(total / CHUNK_SIZE);

    this.snackBar.open(
      `Saving ${total} frames in ${numChunks} ZIP file(s)...`, undefined, { duration: 0 }
    );

    const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

    for (let chunk = 0; chunk < numChunks; chunk++) {
      const start = chunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, total);

      this.offlineProgress.set(
        `ZIP ${chunk + 1}/${numChunks}: packing frames ${start}–${end - 1}...`
      );
      await yieldToUI();

      const zip = new JSZip();
      const folder = zip.folder('frames')!;
      for (let i = start; i < end; i++) {
        folder.file(`frame_${String(i).padStart(6, '0')}.png`, this.capturedFrames[i]);
      }

      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'STORE' },
        (meta) => this.offlineProgress.set(
          `ZIP ${chunk + 1}/${numChunks}: ${meta.percent.toFixed(0)}%`
        )
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = numChunks === 1
        ? 'frames_4k.zip'
        : `frames_4k_part${String(chunk + 1).padStart(2, '0')}.zip`;
      a.click();

      // Give browser time to start the download before revoking
      await new Promise(resolve => setTimeout(resolve, 1000));
      URL.revokeObjectURL(url);
      await yieldToUI();
    }

    this.offlineProgress.set(`Done! Downloaded ${total} frames in ${numChunks} ZIP(s).`);
    this.snackBar.open(`Downloaded ${total} frames`, 'OK', { duration: 5000 });
  }
}
