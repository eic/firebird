import {computed, effect, inject, Injectable, linkedSignal, Signal, signal, WritableSignal} from '@angular/core';
import {Subscription} from 'rxjs';
import {Group as TweenGroup, Tween} from '@tweenjs/tween.js';
import {ThreeService} from './three.service';
import {GeometryService} from './geometry.service';
import {DataModelService} from './data-model.service';
import {ConfigService} from './config.service';
import {UrlService} from './url.service';


import {disposeHierarchy} from '@dexvis/threejs-tree-editor';
import {ThreeEventProcessor} from '../data-pipelines/three-event.processor';
import {DataExchange, DataModelPainter, DisplayMode, LoadedGeometry} from '@firebird/core';
import {AnimationManager} from "../animation/animation-manager";
import {Mesh, MeshBasicMaterial, SphereGeometry, Vector3} from "three";
import {arrangeEpicDetectors} from "../utils/epic-geometry-arranger";
import {EVENT_DATA_LAYER} from "./geometry-slice";
import {PAINTERS} from "../firebird/tokens";
import {BatchStatusService} from "../firebird/batch-status.service";
import {CommandBusService} from "../firebird/command-bus.service";
import {PainterConfigService} from "./painter-config.service";
import {ConfigProperty} from "../utils/config-property";
import type {RenderView} from "./render-view";


@Injectable({
  providedIn: 'root',
})
export class EventDisplayService {

  private eventsByName = new Map<string, any>();
  private eventsArray: any[] = [];
  private _animationSpeed: number = 1.0;

  selectedEventKey: string | undefined;

  // Time
  //private eventDisplayMode: WritableSignal<DisplayMode> = signal(DisplayMode.Timeless);
  public eventTime: WritableSignal<number | null> = signal(0);

  // Animation cycling
  public animationIsCycling: WritableSignal<boolean> = signal(false);

  // Whether camera moves (zoom/pan) during time animation
  public animateCameraMovement: boolean = false;


  public maxTime = 200;
  public minTime = 0;


  // Time animation
  private tweenGroup = new TweenGroup();
  private tween: Tween<any> | null = null;
  private beamAnimationTime: number = 1000;

  // Geometry
  private animateEventAfterLoad: boolean = false;
  private trackInfos: any | null = null; // Replace 'any' with the actual type

  // Painter that draws the event
  private painter: DataModelPainter = new DataModelPainter();

  // Animation manager
  private animationManager: AnimationManager;

  /** The last successfully loaded Firebird DEX JSON url. Switches to null on every new load attempt */
  public lastLoadedDexUrl: string | null = "";

  /** The last successfully loaded Geometry url. Switches to null on every new load attempt */
  public lastLoadedGeometryUrl: string | null = "";

  /** The last successfully loaded Edm4Eic converted url. Switches to null on every new load attempt */
  public lastLoadedRootUrl: string | null = "";
  public lastLoadedRootEventRange: string | null = "";

  /** Batch/headless readiness flags (window.firebird) — loads report through it. */
  private batchStatus = inject(BatchStatusService);

  /** Startup command queue (?dex=, ?geometry=, ?cmd=, server startupCommands). */
  private commandBus = inject(CommandBusService);

  /** Loading indicators for the display pages' footers (service-owned so
   * every page shows the same state). */
  readonly loadingDex = signal(false);
  readonly loadingEdm = signal(false);
  readonly loadingGeometry = signal(false);

  /** Painter selection + knob keys (painters.byPiece.*) over ConfigService. */
  private painterConfig = inject(PainterConfigService);

  /** Painter config keys subscribed for live updates, with their
   * subscriptions so watchers of vanished pieces can be pruned. */
  private watchedPainterKeys = new Map<string, Subscription>();

  /** Resolves when all lazily-registered painters (withLazyPainter) are in. */
  private paintersReady: Promise<void>;

  constructor(
    public three: ThreeService,
    private geomService: GeometryService,
    private config: ConfigService,
    private dataService: DataModelService,
    private urlService: UrlService
  ) {

    // Painters come from DI (PAINTERS token, `withPainter()` features).
    // Group factories are registered by the provideFirebird app initializer.
    const lazyPainterLoads: Promise<void>[] = [];
    for (const registration of inject(PAINTERS, {optional: true}) ?? []) {
      if (registration.painterClass) {
        this.painter.registerPainter(registration.forPieceType, registration.painterClass);
      } else if (registration.load) {
        lazyPainterLoads.push(registration.load().then(painterClass => {
          this.painter.registerPainter(registration.forPieceType, painterClass);
        }));
      }
    }
    this.paintersReady = Promise.all(lazyPainterLoads).then(() => {});

    // Painter selection and knobs are config keys (painters.byPiece.*):
    // - the selector resolves which registered painter draws each piece,
    //   watching the key so a selection change rebuilds the painters;
    // - the config view hands the knob values to the painter instance,
    //   watching each knob so changes restyle live (onConfigChanged).
    this.painter.painterSelector = (piece, candidates) => {
      if (candidates.length === 0) return undefined;
      const property = this.painterConfig.selectionProperty(piece.name, candidates);
      this.watchPainterKey(property, () => this.rebuildPainters());
      return this.painterConfig.resolveSelection(piece.name, candidates);
    };
    this.painter.configViewProvider = (piece, painterClass) => {
      for (const property of this.painterConfig.knobProperties(piece, painterClass).values()) {
        this.watchPainterKey(property, () => {
          this.painter.painterFor(piece.name)?.onConfigChanged();
          this.three.invalidate();
        });
      }
      return this.painterConfig.buildConfigView(piece, painterClass);
    };

    // Connect painter to its scene place
    this.painter.setThreeSceneParent(this.three.sceneEvent);

    // Connect animation manager with threejs components
    this.animationManager = new AnimationManager(this.three.scene, this.three.camera, this.three.renderer);

    // On time change
    effect(() => {
      const time = this.eventTime();
      this.painter.paint(time);
      this.stampEventLayers();
      this.three.invalidate();
    }, {debugName: "EventDisplayService.OnTimeChange"});

    effect(() => {
      //this.processCurrentTimeChange(this.eventTime());
      const geometry = this.geomService.geometry();
    }, {debugName: "EventDisplayService.OnTimeChange"});

    // On current entry change
    effect(() => {
      console.log("[eventDisplay] Entry change effect start")
      let event = this.dataService.currentEntry();

      // Make sure to clean-up even if event is null
      // this.painter.cleanupCurrentEntry();

      if (event === null || this.painter.getEntry() == event) return;
      this.painter.setEntry(event);
      this.painter.paint(null);
      this.stampEventLayers();
      this.pruneStalePainterWatchers();

      // Let ThreeExtensions react to the freshly painted event
      // (notifyEventLoaded also invalidates the render loop)
      this.three.notifyEventLoaded(event);

      console.log("[eventDisplay] Entry change effect end")
    }, {debugName: "EventDisplayService.OnEventChange"});
  }

  // ****************************************************
  // *************** THREE SETUP ************************
  // ****************************************************

  /**
   * Initialize the default three.js scene
   * @param container
   */
  async initThree(container: string | HTMLElement) {
    await this.three.init(container);
    this.painter.setThreeSceneParent(this.three.sceneEvent);
    this.three.startRendering();

    // Advances the tween group each frame. A stable bound member, not an
    // inline closure: initThree runs once per display-page mount, and
    // addFrameCallback deduplicates by function identity — an inline closure
    // would stack one registration per page visit.
    this.three.addFrameCallback(this.tweenFrameCallback);

    this.wireDisplayTracksOnTop();
  }

  /** Guards the one-time config subscription (initThree runs per page mount). */
  private displayTracksOnTopWired = false;

  /**
   * Applies the display page's tracks-over-geometry mode to the main view.
   * Runs on every page init (the quad page overrides the main view's flag
   * from its own quadView.main key right after its views are created) and
   * subscribes once so the tool-panel toggle takes effect live.
   */
  private wireDisplayTracksOnTop(): void {
    const property = this.config.getConfigOrCreate<boolean>('display.tracksOnTop', false);
    const apply = (onTop: boolean) => {
      const main = this.three.views[0];
      if (main) {
        main.tracksOnTop = onTop;
        main.dirty = true;
      }
    };
    apply(property.value);
    if (!this.displayTracksOnTopWired) {
      this.displayTracksOnTopWired = true;
      property.subject.subscribe(apply);
    }
  }

  /** See initThree — identity matters for addFrameCallback deduplication.
   * A PLAYING tween re-invalidates the loop each frame, sustaining the
   * animation chain under render-on-demand; the chain ends when every tween
   * stopped or completed. allStopped(), not getAll().length: tween.js keeps
   * stopped/finished tweens in the group (update() defaults to
   * preserve=true and never evicts), so a length check would keep the loop
   * rendering forever after the first animation. */
  private readonly tweenFrameCallback = () => {
    if (!this.tweenGroup.allStopped()) {
      this.tweenGroup.update();
      this.three.invalidate();
    }
  };


  /** The painter drawing the named piece of the current event, or null. */
  painterFor(pieceName: string) {
    return this.painter.painterFor(pieceName);
  }

  /** Painter classes registered for a piece type (panel dropdown options). */
  paintersForType(pieceType: string) {
    return this.painter.paintersForType(pieceType);
  }

  /** Subscribes once per config key; runs `action` on every later change. */
  private watchPainterKey(property: ConfigProperty<any>, action: () => void): void {
    if (this.watchedPainterKeys.has(property.key)) return;
    let isFirst = true; // changes$ replays the current value on subscribe
    const subscription = property.changes$.subscribe(() => {
      if (isFirst) {
        isFirst = false;
        return;
      }
      action();
    });
    this.watchedPainterKeys.set(property.key, subscription);
  }

  /**
   * Drops watchers whose piece is absent from the current entry — piece names
   * come and go with data files, and a vanished piece must not keep a live
   * config subscription. Watchers for still-present pieces are recreated by
   * the painter hooks during paint, so pruning after setEntry is safe.
   * Key shapes: painters.byPiece.<piece> and painters.byPiece.<piece>.<knob>.
   */
  private pruneStalePainterWatchers(): void {
    const entry = this.painter.getEntry();
    if (!entry) return;
    const activePieces = new Set(entry.pieces.map(piece => piece.name));
    for (const [key, subscription] of this.watchedPainterKeys) {
      const pieceName = key.split('.')[2];
      if (pieceName && !activePieces.has(pieceName)) {
        subscription.unsubscribe();
        this.watchedPainterKeys.delete(key);
      }
    }
  }

  /** Rebuilds the piece painters of the current entry (painter selection changed). */
  private rebuildPainters(): void {
    const entry = this.painter.getEntry();
    if (!entry) return;
    this.painter.setEntry(entry);
    this.painter.paint(this.eventTime());
    this.stampEventLayers();
    this.three.invalidate();
  }

  /**
   * Routes every painted event object to EVENT_DATA_LAYER (see
   * geometry-slice.ts for the layer scheme). Layers are per-object and
   * painters create objects with the default layer, so the stamp runs after
   * every paint that may have created objects. Idempotent and cheap — the
   * event subtree is small.
   */
  private stampEventLayers(): void {
    this.three.sceneEvent?.traverse(object => object.layers.set(EVENT_DATA_LAYER));
  }

  // ****************************************************
  // *************** TIME *******************************
  // ****************************************************

  public updateEventTime(time: number) {
    this.eventTime.set(time);
  }

  getMaxTime(): number {
    return this.maxTime;
  }

  getMinTime(): number {
    return this.minTime;
  }

  get animationSpeed(): number {
    return this._animationSpeed;
  }

  set animationSpeed(value: number) {
    this._animationSpeed = Math.max(0.1, value);
  }

  private get timeStepSize(): number {
    // never allow a zero step
    return Math.max(this._animationSpeed, 0.1);
  }


  animateTime() {
    let time = this.eventTime() ?? this.minTime;
    const timeToTravel = this.maxTime - time;

    // Speed: the higher the animationSpeed, the faster (less duration)
    const baseMsPerUnit = 200;
    const speed = this.animationSpeed;

    const duration = timeToTravel * (baseMsPerUnit / speed);

    this.animateCurrentTime(this.maxTime, duration);
  }


  stopTimeAnimation(): void {
    if (this.tween) {
      this.tween.stop(); // Stops the tween if it is running
      this.tween = null; // Remove reference
    }
  }

  rewindTime() {
    this.updateEventTime(0);
  }

  animateCurrentTime(targetTime: number, duration: number): void {
    if (this.tween) {
      this.stopTimeAnimation();
    }

    this.tween = new Tween({currentTime: this.eventTime() ?? this.minTime}, this.tweenGroup)
      .to({currentTime: targetTime}, duration)
      .onUpdate((obj) => {
        this.eventTime.set(obj.currentTime);
        if (this.animateCameraMovement) {
          const dz = Math.max(obj.currentTime/10, 25);
          if(obj.currentTime <50) {
            const direction = new Vector3();
            direction.subVectors(this.three.controls.target, this.three.camera.position).normalize();
            const zoomAmount = -5;
            this.three.camera.position.addScaledVector(direction, zoomAmount);  // positive = zoom in
          }
          this.three.camera.position.setZ(this.three.camera.position.z + dz);
          this.three.controls.target.setZ(this.three.controls.target.z + dz);
          this.three.camera.updateMatrix();
        }
      }).onStop((time)=>{
        console.log(`[eventDisplay]: time animation stopped at: ${time}`);
      }).onComplete((time)=>{
        if(this.animationIsCycling()) {
          this.dataService.setNextEntry();
          setTimeout(() => { this.animateWithCollision();}, 1);
        }
      })
      // .easing(TWEEN.Easing.Quadratic.In) // This can be changed to other easing functions
      .start();

    // Seed the render-on-demand chain: the first rendered frame advances the
    // tween, whose update re-invalidates until it completes.
    this.three.invalidate();
  }

  /**
   * Animate the collision of two particles.
   * @param tweenDuration Duration of the particle collision animation tween.
   * @param particleSize Size of the particles.
   * @param distanceFromOrigin Distance of the particles (along z-axes) from the origin.
   * @param onEnd Callback to call when the particle collision ends.
   */
  public animateParticlesCollide(
    tweenDuration: number,
    particleSize: number = 30,
    distanceFromOrigin: number = 5000,
    onEnd?: () => void,
  ) {

    // Make electron
    const electronGeometry = new SphereGeometry(particleSize, 32, 32);
    const electronMaterial = new MeshBasicMaterial({ color: 0x0000FF, transparent: true, opacity: 0});
    const electron = new Mesh(electronGeometry, electronMaterial);

    // Make ion
    const ionMaterial = new MeshBasicMaterial({ color: 0xFF0000, transparent: true, opacity: 0});
    const ionGeometry = new SphereGeometry(2*particleSize, 32, 32);
    const ion = new Mesh(ionGeometry, ionMaterial);

    electron.position.setZ(distanceFromOrigin);
    ion.position.setZ(-distanceFromOrigin);

    const particles = [electron, ion];
    // Added outside the paint path — route to the event layer directly.
    for (const particle of particles) particle.layers.set(EVENT_DATA_LAYER);

    this.three.sceneEvent.add(...particles);

    const particleTweens = [];

    for (const particle of particles) {
      new Tween(particle.material, this.tweenGroup)
        .to({opacity: 1,},300,)
        .start();

      const particleToOrigin = new Tween(particle.position, this.tweenGroup)
        .to({z: 0,}, tweenDuration,)
        .onUpdate((time)=>{// Move camera closer to the target (what you're doing, but toward target)
          if (this.animateCameraMovement) {
            const direction = new Vector3();
            direction.subVectors(this.three.controls.target, this.three.camera.position).normalize();
            const zoomAmount = 3;
            this.three.camera.position.addScaledVector(direction, zoomAmount);  // positive = zoom in
          }
        })
        .start();

      particleTweens.push(particleToOrigin);
    }

    particleTweens[0].onComplete(() => {
      this.three.sceneEvent.remove(...particles);
      onEnd?.();
    });

    // Seed the render-on-demand chain (see animateCurrentTime).
    this.three.invalidate();
  }

  animateWithCollision() {
    this.stopTimeAnimation();
    this.rewindTime();
    if (this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = false;
      }
    }

    const ed_this = this;
    this.animateParticlesCollide(1000, undefined, undefined, ()=>{
      ed_this.animateTime();
    });
  }

  timeStepBack(): void {
    const t = this.eventTime() ?? this.minTime;
    this.updateEventTime(Math.max(t - this.timeStepSize, this.minTime));
  }


  timeStep(): void {
    const t = this.eventTime();
    if (t == null) return;
    this.updateEventTime(Math.min(t + this.timeStepSize, this.maxTime));
  }

  exitTimedDisplay() {

    this.stopTimeAnimation();
    this.eventTime.set(null);
    this.animateEventAfterLoad = false;
    if (this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = true;
        // Show all line segments: instanceCount = number of segment instances
        const startAttr = trackInfo.newLine.geometry.getAttribute('instanceStart');
        trackInfo.newLine.geometry.instanceCount = startAttr ? startAttr.count : 0;
      }
    }
    this.three.invalidate();
  }

  // Animation cycling methods
  startAnimationCycling() {
    this.animationIsCycling.set(true);
    // TODO: Implement animation cycling logic
  }

  stopAnimationCycling() {
    this.animationIsCycling.set(false);
    // TODO: Stop animation cycling logic
  }

  // Entry navigation
  setNextEntry() {
    this.dataService.setNextEntry();
  }

  // ****************************************************
  // *************** DATA LOADING ***********************
  // ****************************************************

  /**
   * Config-driven auto-load with startup-command awareness — the one code
   * path every display page uses, so landing on any of them covers the same
   * sources. Queued startup commands (?dex=..., ?geometry=..., ?cmd=...,
   * server startupCommands) replace the config-driven load for the data
   * types they carry; the queue itself runs after the loads are kicked off.
   *
   * `onError` receives human-readable load failures (pages surface them in
   * their own way — snackbar, console).
   */
  autoLoadAndRunStartup(onError?: (message: string) => void): void {
    const startupCommands = this.commandBus.peekStartupCommands();
    const startupHas = (type: string) => startupCommands.some(c => c.type === type);

    if (!startupHas('open-dex')) {
      this.autoLoadDexFromConfig(onError);
      this.autoLoadRootFromConfig(onError);
    }
    if (!startupHas('open-geometry')) {
      this.autoLoadGeometryFromConfig(onError);
    }

    void this.commandBus.runStartupCommands();
  }

  private autoLoadDexFromConfig(onError?: (message: string) => void): void {
    // getConfigOrCreate, not getConfig: on a direct page landing nothing
    // declared the key yet, and only declaration applies pending URL/server
    // values for it.
    const url = this.config.getConfigOrCreate<string>('events.dexEventsSource', '').value;
    if (!url || url.trim().length === 0) {
      console.log('[eventDisplay]: No DEX event source configured, skipping.');
      return;
    }
    if (this.lastLoadedDexUrl === url) {
      console.log(`[eventDisplay]: Event data (DEX) already loaded from '${url}', skipping.`);
      return;
    }
    this.loadingDex.set(true);
    this.loadDexData(url)
      .catch(error => {
        const message = `Error loading events: ${error}`;
        console.error(`[eventDisplay]: ${message}`);
        onError?.(message);
      })
      .finally(() => this.loadingDex.set(false));
  }

  private autoLoadRootFromConfig(onError?: (message: string) => void): void {
    const url = this.config.getConfigOrCreate<string>('events.rootEventSource', '').value;
    let eventRange = this.config.getConfigOrCreate<string>('events.rootEventRange', '').value;
    if (!url || url.trim().length === 0) {
      console.log('[eventDisplay]: No EDM4eic ROOT source configured, skipping.');
      return;
    }
    if (!eventRange || eventRange.trim().length === 0) {
      eventRange = '0';
    }
    if (this.lastLoadedRootUrl === url && this.lastLoadedRootEventRange === eventRange) {
      console.log(`[eventDisplay]: ROOT events already loaded from '${url}' (${eventRange}), skipping.`);
      return;
    }
    this.loadingEdm.set(true);
    this.loadRootData(url, eventRange)
      .catch(error => {
        const message = `Error loading events: ${error}`;
        console.error(`[eventDisplay]: ${message}`);
        onError?.(message);
      })
      .finally(() => this.loadingEdm.set(false));
  }

  private autoLoadGeometryFromConfig(onError?: (message: string) => void): void {
    const url = this.config.getConfigOrCreate<string>('geometry.selectedGeometry', '').value;
    if (!url || url.trim().length === 0) {
      console.log('[eventDisplay]: No geometry configured, skipping.');
      return;
    }
    if (this.lastLoadedGeometryUrl === url) {
      console.log(`[eventDisplay]: Geometry already loaded from '${url}', skipping.`);
      return;
    }
    // A load may still be running from another page visit — supersede it.
    if (this.geomService.isLoading()) {
      this.geomService.cancelLoading();
    }
    this.loadingGeometry.set(true);
    this.loadGeometry(url)
      .then(result => {
        if (result.cancelled) {
          console.log('[eventDisplay]: Geometry load superseded by a newer one.');
        }
      })
      .catch(error => {
        console.error(`[eventDisplay]: Error loading geometry: ${error}`);
        onError?.("Error loading Geometry. Open 'Configure' to change. Press F12->Console for logs");
      })
      .finally(() => this.loadingGeometry.set(false));
  }

  /**
   * Load geometry
   */
  async loadGeometry(url: string, scale = 10, clearGeometry = true): Promise<LoadedGeometry> {
    this.lastLoadedGeometryUrl = null;
    this.batchStatus.beginGeometryLoad();
    try {
      let {rootGeometry, threeGeometry} = await this.geomService.loadGeometry(url);
      if (!threeGeometry) return {root: null, cancelled: true};

      const sceneGeo = this.three.sceneGeometry;

      // There should be only one geometry if clearGeometry=true
      if (clearGeometry && sceneGeo.children.length > 0) {
        disposeHierarchy(sceneGeo, /* disposeSelf= */ false);
      }

      await this.geomService.postProcessing(threeGeometry, this.three.clipPlanes, {
        renderer: this.three.renderer,
        sceneGeometry: this.three.sceneGeometry,
        scene: this.three.scene,
      });

      sceneGeo.add(threeGeometry);

      // Set geometry scale (ROOT uses cm, we want mm, so scale by 10)
      if (scale) {
        sceneGeo.scale.setScalar(scale);
        // Since matrixAutoUpdate is false on worker-loaded geometry,
        // we must manually update the matrix after changing scale
        sceneGeo.updateMatrix();
        sceneGeo.updateMatrixWorld(true);
      }

      // Arrange by category
      arrangeEpicDetectors(sceneGeo);

      // The projection views' geometry copy tracks every load (no-op when
      // no slice exists — single-view pages).
      this.three.rebuildGeometrySlice();

      this.lastLoadedGeometryUrl = url;
      this.batchStatus.endGeometryLoad(true);
      return {root: threeGeometry};
    } catch (error) {
      this.batchStatus.endGeometryLoad(false);
      throw error;
    }
  }

  async loadDexData(url: string): Promise<DataExchange | null> {
    this.lastLoadedDexUrl = null;
    this.batchStatus.beginEventLoad();
    await this.paintersReady;
    try {
      const data = await this.dataService.loadDexData(url);
      if (data == null) {
        console.warn(
          'DataService.loadDexData() Received data is null or undefined'
        );
        return null;
      }

      if ((data.events?.length ?? 0) > 0) {
        this.painter.setEntry(data.events[0]);
        this.eventTime.set(null);
        this.painter.paint(this.eventTime());
        this.stampEventLayers();
        this.three.invalidate();
        this.lastLoadedDexUrl = url;
        return data;
      } else {
        console.warn('DataService.loadDexData() Received data had no entries');
        console.log(data);
        return null;
      }
    } finally {
      this.batchStatus.endEventLoad();
    }
  }

  async loadRootData(url: string, eventRange: string = "0"): Promise<DataExchange | null> {
    this.lastLoadedRootUrl = null;
    this.lastLoadedRootEventRange = null;
    this.batchStatus.beginEventLoad();
    await this.paintersReady;
    try {
      const data = await this.dataService.loadRootData(url, eventRange);
      if (data == null) {
        console.warn(
          'DataService.loadRootData() Received data is null or undefined'
        );
        return null;
      }

      if ((data.events?.length ?? 0) > 0) {
        this.painter.setEntry(data.events[0]);
        this.eventTime.set(null);
        this.painter.paint(this.eventTime());
        this.stampEventLayers();
        this.three.invalidate();
        this.lastLoadedRootUrl = url;
        this.lastLoadedRootEventRange = eventRange;
        return data;
      } else {
        console.warn('DataService.loadRootData() Received data had no entries');
        console.log(data);
        return null;
      }
    } finally {
      this.batchStatus.endEventLoad();
    }
  }

  // ****************************************************
  // *************** EVENTS *****************************
  // ****************************************************

  /**
   * Process current time change
   * @param value
   * @private
   */
  private processCurrentTimeChange(value: number | null) {

  }

  public buildEventDataFromJSON(eventData: any) {
    const threeEventProcessor = new ThreeEventProcessor();

    console.time('[buildEventDataFromJSON] BUILD EVENT');

    this.three.sceneEvent.clear();

    // Event data collections by type
    for (const collectionType in eventData) {
      const collectionsOfType = eventData[collectionType];

      for (const collectionName in collectionsOfType) {
        const collection = collectionsOfType[collectionName];
      }
    }

    // Post-processing for specific event data types
    const mcTracksGroup = this.three.sceneEvent.getObjectByName('mc_tracks');
    if (mcTracksGroup) {
      this.trackInfos = threeEventProcessor.processMcTracks(mcTracksGroup);

      let minTime = Infinity;
      let maxTime = 0;
      for (const trackInfo of this.trackInfos) {
        if (trackInfo.startTime < minTime) minTime = trackInfo.startTime;
        if (trackInfo.endTime > maxTime) maxTime = trackInfo.endTime;
      }

      this.maxTime = maxTime;
      this.minTime = minTime;

      console.log(`Tracks: ${this.trackInfos.length}`);
      if (this.trackInfos && this.animateEventAfterLoad) {
        for (const trackInfo of this.trackInfos) {
          trackInfo.trackNode.visible = false;
        }
      }
      console.timeEnd('Process tracks on event load');
    }

    console.timeEnd('[buildEventDataFromJSON] BUILD EVENT');

    if (this.animateEventAfterLoad) {
      this.animateWithCollision();
    }
  }

  /**
   * Offline frame-by-frame render. Steps the tween manually,
   * captures each frame as PNG, returns array of blobs.
   *
   * `views` selects what is recorded: one view renders FULL-FRAME at the
   * target resolution (its camera, per-view cut and tracks-on-top applied —
   * not cropped from the on-screen grid); several views render a 2-column
   * grid composite the way the quad page draws them. Default is the main
   * view — the original single-camera behavior.
   */
  async captureFramesOffline(options: {
    overrideResolution?: boolean;
    width: number;
    height: number;
    eventTimeStep: number;       // event-time units per frame, e.g. 0.1
    includeCollision?: boolean;
    onProgress?: (current: number, total: number) => void;
    signal?: AbortSignal;
    views?: RenderView[];
  }): Promise<Blob[]> {
    const { width, height, eventTimeStep, onProgress } = options;
    const renderer = this.three.renderer;
    const views = options.views?.length ? options.views : [this.three.mainView];

    // ── Save original state ──
    const origWidth = renderer.domElement.width;
    const origHeight = renderer.domElement.height;
    const origPixelRatio = renderer.getPixelRatio();
    const origCameraPos = this.three.camera.position.clone();
    const origTarget = this.three.controls.target.clone();

    // ── Force render resolution (opt-in) ──
    if (options.overrideResolution) {
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(1);
    }

    // Aim each recorded view's cameras at its capture rectangle's aspect
    // (full frame for one view, a quadrant for the composite — same aspect
    // either way). updateViewport() restores on-screen aspects afterwards.
    const captureWidth = options.overrideResolution ? width : renderer.domElement.width / origPixelRatio;
    const captureHeight = options.overrideResolution ? height : renderer.domElement.height / origPixelRatio;
    for (const view of views) {
      view.setCaptureAspect(captureWidth, captureHeight);
    }

    const frames: Blob[] = [];

    const renderCaptureFrame = (): void => {
      if (views.length === 1) {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, captureWidth, captureHeight);
        views[0].renderFullFrame(renderer, this.three.scene);
        return;
      }
      // Grid composite: 2 columns, views in reading order (the quad page
      // passes [top, side, front, main] to reproduce its layout).
      const columns = 2;
      const rows = Math.ceil(views.length / columns);
      const cellWidth = captureWidth / columns;
      const cellHeight = captureHeight / rows;
      renderer.setScissorTest(true);
      views.forEach((view, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        // This renderer's viewport origin is top-left (WebGPURenderer
        // convention on both backends — same math as RenderView.updateViewport).
        view.renderTo(renderer, this.three.scene, {
          x: column * cellWidth,
          y: row * cellHeight,
          width: cellWidth,
          height: cellHeight,
        });
      });
      renderer.setScissorTest(false);
    };

    const captureFrame = (): Promise<Blob> => {
      renderCaptureFrame();
      return new Promise((resolve, reject) => {
        renderer.domElement.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('toBlob failed')),
          'image/png'
        );
      });
    };

    // ── Yield to browser so UI updates (progress bar etc.) ──
    const yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0));

    try {
      // ── Phase 1: Collision particles (optional) ──
      if (options.includeCollision) {
        const collisionDuration = 1000; // ms, matches animateParticlesCollide
        const collisionFps = 60;
        const collisionMsPerFrame = 1000 / collisionFps;
        const collisionFrames = Math.ceil(collisionDuration / collisionMsPerFrame);

        // Reset state
        this.rewindTime();
        this.three.camera.position.copy(origCameraPos);
        this.three.controls.target.copy(origTarget);

        // Build offline tween group for collision
        const collGroup = new TweenGroup();

        const particleSize = 30;
        const dist = 5000;

        const electronGeom = new SphereGeometry(particleSize, 32, 32);
        const electronMat = new MeshBasicMaterial({ color: 0x0000FF, transparent: true, opacity: 0 });
        const electron = new Mesh(electronGeom, electronMat);
        electron.position.setZ(dist);

        const ionGeom = new SphereGeometry(2 * particleSize, 32, 32);
        const ionMat = new MeshBasicMaterial({ color: 0xFF0000, transparent: true, opacity: 0 });
        const ion = new Mesh(ionGeom, ionMat);
        ion.position.setZ(-dist);

        // Added outside the paint path — route to the event layer directly.
        electron.layers.set(EVENT_DATA_LAYER);
        ion.layers.set(EVENT_DATA_LAYER);
        this.three.sceneEvent.add(electron, ion);

        // Opacity fade-in
        new Tween(electronMat, collGroup).to({ opacity: 1 }, 300).start(0);
        new Tween(ionMat, collGroup).to({ opacity: 1 }, 300).start(0);

        // Move to origin
        new Tween(electron.position, collGroup)
          .to({ z: 0 }, collisionDuration)
          .onUpdate(() => {
            if (this.animateCameraMovement) {
              const dir = new Vector3().subVectors(this.three.controls.target, this.three.camera.position).normalize();
              this.three.camera.position.addScaledVector(dir, 3);
            }
          })
          .start(0);
        new Tween(ion.position, collGroup).to({ z: 0 }, collisionDuration).start(0);

        for (let i = 0; i <= collisionFrames; i++) {
          if (options.signal?.aborted) break;
          collGroup.update(i * collisionMsPerFrame);
          frames.push(await captureFrame());
          onProgress?.(frames.length, -1); // indeterminate total during collision
          await yieldFrame();
        }

        this.three.sceneEvent.remove(electron, ion);
        electronGeom.dispose(); electronMat.dispose();
        ionGeom.dispose(); ionMat.dispose();
      }

      // ── Phase 2: Time animation ──
      // Speed scales event-time per frame: speed=2 → 2x event-time per frame → half as many frames
      const totalEventTime = this.maxTime - this.minTime;
      const effectiveStep = eventTimeStep * this.animationSpeed;
      const totalFrames = Math.ceil(totalEventTime / effectiveStep);

      for (let i = 0; i <= totalFrames; i++) {
        if (options.signal?.aborted) break;

        const currentTime = Math.min(this.minTime + i * effectiveStep, this.maxTime);
        this.eventTime.set(currentTime);
        // Paint NOW: signal effects flush asynchronously, and the capture
        // renders synchronously below — without the direct paint every frame
        // would show the PREVIOUS step's state (and the first frame whatever
        // was on screen). The later effect flush repaints the same time.
        this.painter.paint(currentTime);
        this.stampEventLayers();

        // Camera movement (matches animateCurrentTime tween onUpdate)
        if (this.animateCameraMovement) {
          const dz = Math.max(currentTime / 10, 25);
          if (currentTime < 50) {
            const direction = new Vector3()
              .subVectors(this.three.controls.target, this.three.camera.position)
              .normalize();
            this.three.camera.position.addScaledVector(direction, -5);
          }
          this.three.camera.position.setZ(this.three.camera.position.z + dz);
          this.three.controls.target.setZ(this.three.controls.target.z + dz);
          this.three.camera.updateMatrix();
        }

        frames.push(await captureFrame());
        onProgress?.(frames.length, totalFrames);
        await yieldFrame();
      }

    } finally {
      // ── Restore everything ──
      if (options.overrideResolution) {
        renderer.setSize(origWidth, origHeight, false);
        renderer.setPixelRatio(origPixelRatio);
      }
      this.three.camera.position.copy(origCameraPos);
      this.three.controls.target.copy(origTarget);
      this.three.camera.updateMatrix();
      // On-screen aspects come back from the view containers.
      for (const view of views) {
        view.updateViewport();
      }
      this.three.invalidate();
    }

    return frames;
  }
}
