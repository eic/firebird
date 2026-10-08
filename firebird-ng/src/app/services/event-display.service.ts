import {computed, effect, inject, Injectable, signal, untracked, WritableSignal} from '@angular/core';
import {Subscription} from 'rxjs';
import {Group as TweenGroup, Tween} from '@tweenjs/tween.js';
import {ThreeService} from './three.service';
import {GeometryService} from './geometry.service';
import {DataModelService} from './data-model.service';
import {CommandBusService, ConfigProperty, ConfigService} from '@dexvis/app-features';
import {UrlService} from './url.service';


import {disposeHierarchy} from '@dexvis/threejs-tree-editor';
import {ThreeEventProcessor} from '../data-pipelines/three-event.processor';
import {DataExchange, DataModelPainter, DisplayMode, Event, LoadedGeometry} from '@dexvis/firebird-core';
import {AnimationManager} from "../animation/animation-manager";
import {Mesh, MeshBasicMaterial, SphereGeometry, Vector2, Vector3} from "three";
import {arrangeEpicDetectors} from "../utils/epic-geometry-arranger";
import {EVENT_DATA_LAYER} from "./geometry-slice";
import {EVENT_LOADERS, PAINTERS} from "../firebird/tokens";
import {
  DEX_EVENTS_SOURCE_CONFIG,
  GEOMETRY_URL_CONFIG,
  ROOT_COLLECTIONS_CONFIG,
  ROOT_EVENT_RANGE_CONFIG,
  ROOT_EVENTS_SOURCE_CONFIG,
} from "../firebird/config-keys";
import {DataSelectionService, isRootSource} from "./data-selection.service";
import {BatchStatusService} from "../firebird/batch-status.service";
import {PainterConfigService} from "./painter-config.service";
import type {RenderView} from "./render-view";
import {MessageService} from "./message.service";


/**
 * Identifies an events source the way the display compares sources: the URL,
 * plus for a ROOT file the entries and collection groups that were converted
 * (the same file with another range is another source).
 */
export interface EventsSourceId {
  url: string;
  /** For a ROOT source: entry numbers as typed ('0', '0-4', '1,3'). */
  entries?: string;
  /** For a ROOT source: collection groups, a comma list or an array; empty means all. */
  collections?: string | string[];
}

/**
 * One requested events load, handed to `showDexDocument()` by loaders that do
 * their own work first (see `EventDisplayService.runEventsLoad()`).
 */
export interface EventsLoadRequest {
  /** False once a newer events load was requested; its data is then not shown. */
  readonly isCurrent: boolean;
}

/** What a load request loads, and the configured source when it was requested. */
interface LoadTarget {
  /** The source's key; null for a picked file or an unnamed document. */
  key: string | null;
  /** The configured source's key ('' for none) at request time. */
  configKey: string;
}

/** The comparison key of an events source; see EventsSourceId. */
export function eventsSourceKey(source: EventsSourceId | string): string {
  if (typeof source === 'string') return source.trim();
  const url = source.url.trim();
  if (source.entries === undefined && source.collections === undefined) return url;
  const groups = Array.isArray(source.collections) ? source.collections : (source.collections ?? '').split(',');
  const collections = groups.map(group => group.trim()).filter(Boolean).join(',');
  return `${url}#entries=${(source.entries ?? '').trim() || '0'}&collections=${collections}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}


@Injectable({
  providedIn: 'root',
})
export class EventDisplayService {

  private eventsByName = new Map<string, any>();
  private eventsArray: any[] = [];

  selectedEventKey: string | undefined;

  // Time
  //private eventDisplayMode: WritableSignal<DisplayMode> = signal(DisplayMode.Timeless);
  public eventTime: WritableSignal<number | null> = signal(0);

  // Animation cycling
  public animationIsCycling: WritableSignal<boolean> = signal(false);

  // Whether camera moves (zoom/pan) during time animation
  public animateCameraMovement: boolean = false;


  // Time range and step of the time slider. Signals: the time control's
  // dialog changes them, and templates outside the dialog read them.
  /** End of the event time range [ns]. */
  readonly maxTime = signal(200);
  /** Start of the event time range [ns]. */
  readonly minTime = signal(0);
  private readonly animationSpeedSignal = signal(1.0);
  /** Time step per animation tick and per step button (at least 0.1). */
  readonly animationSpeed = this.animationSpeedSignal.asReadonly();


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

  /** Batch/headless readiness flags (window.firebird) — loads report through it. */
  private batchStatus = inject(BatchStatusService);

  /** Startup command queue (?dex=, ?geometry=, ?cmd=, server startupCommands). */
  private commandBus = inject(CommandBusService);

  /** The user-visible error channel; see reportError(). */
  private messages = inject(MessageService);

  /** Which kind of events load runs for the footer spinners; null when none. */
  private readonly eventsLoading = signal<'dex' | 'root' | null>(null);

  /** Loading indicators for the display pages' footers (service-owned so
   * every page shows the same state). Each shows the LATEST requested load:
   * a superseded load that ends later does not touch them. */
  readonly loadingDex = computed(() => this.eventsLoading() === 'dex');
  readonly loadingEdm = computed(() => this.eventsLoading() === 'root');
  readonly loadingGeometry = signal(false);

  /** Bumped by every requested events / geometry load; the latest one wins. */
  private eventsGeneration = 0;
  private geometryGeneration = 0;
  /** Releases the readiness count of the latest events request (once). */
  private releaseEventsReadiness: (() => void) | null = null;

  /**
   * What the latest events / geometry request loads and the configured source
   * at that moment. A display remount compares the config against both: what
   * a deep link, a startup command or a picked file put on screen stays until
   * the configured source changes. Cleared when that request fails, so a
   * remount retries the configured source.
   */
  private eventsTarget: LoadTarget | null = null;
  private geometryTarget: LoadTarget | null = null;

  /** Painter selection + knob keys (painters.byPiece.*) over ConfigService. */
  private painterConfig = inject(PainterConfigService);
  private dataSelection = inject(DataSelectionService);
  /** Registered event loaders (withEventLoader), asked in order for the config-driven ROOT source. */
  private eventLoaders = inject(EVENT_LOADERS, {optional: true}) ?? [];

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
    // Registration rejects painters that declare reserved knob names; such a
    // painter is reported and left out, like one that fails to load.
    for (const registration of inject(PAINTERS, {optional: true}) ?? []) {
      if (registration.painterClass) {
        try {
          this.painter.registerPainter(registration.forPieceType, registration.painterClass);
        } catch (error) {
          this.reportError(`The painter for '${registration.forPieceType}' pieces was not registered: ${errorText(error)}`);
        }
      } else if (registration.load) {
        lazyPainterLoads.push(registration.load()
          .then(painterClass => this.painter.registerPainter(registration.forPieceType, painterClass))
          .catch(error => this.reportError(
            `The painter for '${registration.forPieceType}' pieces failed to load: ${errorText(error)}`)));
      }
    }
    // Every load awaits this. A painter module that fails to load is reported
    // once; its pieces fall back to another registered painter or stay
    // undrawn, and the other pieces and later loads are not affected.
    this.paintersReady = Promise.allSettled(lazyPainterLoads).then(() => {});

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

    // On current entry change (event selector, show-event command, cycling).
    // Load paths present their first entry right away; for those the
    // identity check in presentEntry() makes this a no-op.
    effect(() => {
      const event = this.dataService.currentEntry();
      if (event === null) return;
      untracked(() => this.presentEntry(event));
    }, {debugName: "EventDisplayService.OnEventChange"});
  }

  /**
   * Makes `entry` the painted entry: builds its piece painters, paints it,
   * routes its objects to the event layer, applies per-piece visibility,
   * drops config watchers of vanished pieces, and calls the ThreeExtensions'
   * `onEventLoaded`. This is the one "entry became current" path: load paths
   * call it at once (through showEntry), the entry-change effect calls it for
   * event switches. An entry that is already painted is skipped, so
   * extensions hear about each load and each switch exactly once.
   *
   * @returns False when the entry already was the painted one.
   */
  private presentEntry(entry: Event): boolean {
    if (this.painter.getEntry() === entry) return false;
    this.painter.setEntry(entry);
    this.painter.paint(null);
    this.stampEventLayers();
    this.applyPieceVisibility();
    this.pruneStalePainterWatchers();
    // Let ThreeExtensions react to the freshly painted event
    // (notifyEventLoaded also invalidates the render loop)
    this.three.notifyEventLoaded(entry);
    return true;
  }

  // ****************************************************
  // *************** THREE SETUP ************************
  // ****************************************************

  /**
   * Initialize the default three.js scene
   * @param container
   */
  /**
   * Attaches the display to a page's container and wires the display
   * services. Resolves to false when the page went away (or another display
   * page attached) while the renderer initialized: the caller must then skip
   * its own setup, because the page that superseded it owns the display.
   */
  async initThree(container: string | HTMLElement): Promise<boolean> {
    // init() starts the render loop. It reports false when the page went
    // away (or another page attached) while it waited; that page owns the
    // wiring below.
    if (!await this.three.init(container)) return false;
    // The data selector's Show button reloads through the same config path
    // the startup uses (see loadFromConfig). Attached only while a display
    // page is mounted: the config page applies without a display, and its
    // display page then loads on its own init.
    this.dataSelection.attachDisplay(parts => this.loadFromConfig(parts));
    this.painter.setThreeSceneParent(this.three.sceneEvent);

    // Advances the tween group each frame. A stable bound member, not an
    // inline closure: initThree runs once per display-page mount, and
    // addFrameCallback deduplicates by function identity — an inline closure
    // would stack one registration per page visit.
    this.three.addFrameCallback(this.tweenFrameCallback);

    this.wireDisplayTracksOnTop();
    return true;
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
    this.applyPieceVisibility();
    this.three.invalidate();
  }

  /**
   * Applies the per-piece visibility config (`painters.byPiece.<name>.visible`)
   * to each painter's root node. Runs after every (re)paint of an entry and
   * again on every toggle — the model tree eye and deep links flip the same
   * config key. A hidden piece keeps its painter and objects; only the group
   * node is switched, so showing it again is instant.
   */
  private applyPieceVisibility(): void {
    for (const painter of this.painter.getPainters()) {
      const property = this.painterConfig.visibilityProperty(painter.pieceName);
      this.watchPainterKey(property, () => this.applyPieceVisibility());
      painter.node.visible = property.value !== false;
    }
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
    return this.maxTime();
  }

  getMinTime(): number {
    return this.minTime();
  }

  /** Sets the time range the slider and the animations cover. */
  setTimeRange(minTime: number, maxTime: number): void {
    this.minTime.set(minTime);
    this.maxTime.set(maxTime);
  }

  /** Sets the time step; values below 0.1 are raised to 0.1 (never a zero step). */
  setAnimationSpeed(value: number): void {
    this.animationSpeedSignal.set(Math.max(0.1, value));
  }

  private get timeStepSize(): number {
    return this.animationSpeedSignal();
  }


  animateTime() {
    let time = this.eventTime() ?? this.minTime();
    const timeToTravel = this.maxTime() - time;

    // Speed: the higher the animationSpeed, the faster (less duration)
    const baseMsPerUnit = 200;
    const speed = this.animationSpeed();

    const duration = timeToTravel * (baseMsPerUnit / speed);

    this.animateCurrentTime(this.maxTime(), duration);
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

    this.tween = new Tween({currentTime: this.eventTime() ?? this.minTime()}, this.tweenGroup)
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
    const t = this.eventTime() ?? this.minTime();
    this.updateEventTime(Math.max(t - this.timeStepSize, this.minTime()));
  }


  timeStep(): void {
    const t = this.eventTime();
    if (t == null) return;
    this.updateEventTime(Math.min(t + this.timeStepSize, this.maxTime()));
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
   * On a return to a display page the scene is still there (the services are
   * singletons), so the config is reconciled with what is displayed: a
   * deep-linked, command-loaded or picked geometry or event source stays
   * until the configured source changes, or until the data selector applies a
   * choice. Failures reach the user through reportError().
   */
  autoLoadAndRunStartup(): void {
    const startupCommands = this.commandBus.peekStartupCommands();
    const startupHas = (type: string) => startupCommands.some(c => c.type === type);
    // Applied on the config page while no display was mounted: the user asked
    // for these, so they load even when the config value did not change
    const requested = this.dataSelection.takePendingReload();
    if (!startupHas('open-dex')) this.loadEventsFromConfig(requested.events);
    if (!startupHas('open-geometry')) this.loadGeometryFromConfig(requested.geometry);
    void this.runStartupCommands();
  }

  /**
   * Runs the queued startup commands. Each failure reaches reportError()
   * before `window.firebird.startupCommandsDone` turns true.
   */
  async runStartupCommands(): Promise<void> {
    await this.commandBus.runStartupCommands({
      onFailure: ({command, message}) => {
        // The command's main argument names what failed (open-dex: the URL)
        const argument = [command['url'], command['value'], command['name']]
          .find(value => typeof value === 'string' && value !== '');
        const label = argument ? `${command.type}:${argument}` : command.type;
        this.reportError(`Startup command '${label}' failed: ${message}`);
      },
    });
  }

  /** Display pages call this on destroy; see initThree. */
  detachDataSelection(): void {
    this.dataSelection.detachDisplay();
  }

  /**
   * The one user-visible error channel for loads and startup commands: logs
   * the message, shows it to the user (MessageService), and lists it in
   * `window.firebird.errors`, where batch tools such as `pyrobird screenshot`
   * read it.
   */
  reportError(message: string): void {
    console.error(`[eventDisplay]: ${message}`);
    this.messages.addMessage('error', message);
    this.batchStatus.addError(message);
  }

  /**
   * Loads geometry and events from the config keys (`geometry.selectedGeometry`,
   * `events.dexEventsSource`, or `events.rootEventSource` with
   * `events.rootEventRange` and `events.rootCollections`). Files the user
   * picked in the data selector are waiting in DataSelectionService and load
   * instead of the keys.
   *
   * This is THE config load path: the data selector's Show button (through
   * DataSelectionService.apply) calls it, and the display startup
   * (autoLoadAndRunStartup) shares its parts.
   *
   * @param parts Which halves to load; both by default.
   * @param options.explicit True (the default) loads every configured source
   *   that is not what the display already shows or is loading. False is the
   *   remount rule of autoLoadAndRunStartup().
   */
  loadFromConfig(parts: { events?: boolean; geometry?: boolean } = {}, options: { explicit?: boolean } = {}): void {
    const explicit = options.explicit ?? true;
    if (parts.events ?? true) this.loadEventsFromConfig(explicit);
    if (parts.geometry ?? true) this.loadGeometryFromConfig(explicit);
  }

  /** The configured geometry URL ('' for none). */
  private configuredGeometry(): string {
    // declare, not getConfig: on a direct page landing nothing declared the
    // key yet, and only declaration applies pending URL/server values for it.
    return (this.config.declare(GEOMETRY_URL_CONFIG).value || '').trim();
  }

  /**
   * The configured events source: the DEX key when it is set, otherwise the
   * ROOT key with its entry range and collection groups. The data selector
   * keeps only one of the two keys set.
   */
  private configuredEvents(): (EventsSourceId & { kind: 'dex' | 'root' }) | null {
    const dex = (this.config.declare(DEX_EVENTS_SOURCE_CONFIG).value || '').trim();
    if (dex) return {kind: 'dex', url: dex};
    const root = (this.config.declare(ROOT_EVENTS_SOURCE_CONFIG).value || '').trim();
    if (!root) return null;
    return {
      kind: 'root',
      url: root,
      entries: this.config.declare(ROOT_EVENT_RANGE_CONFIG).value || ROOT_EVENT_RANGE_CONFIG.default,
      collections: this.config.declare(ROOT_COLLECTIONS_CONFIG).value || '',
    };
  }

  private configuredEventsKey(): string {
    const configured = this.configuredEvents();
    return configured ? eventsSourceKey(configured) : '';
  }

  /**
   * Whether the configured source `configKey` should load, given the latest
   * request of that kind. Never when that request already loads exactly this
   * source. An explicit load (Show) runs otherwise; a remount runs only when
   * the configured source changed since that request.
   */
  private isConfigLoadDue(target: LoadTarget | null, configKey: string, explicit: boolean): boolean {
    if (!target) return true;
    if (target.key === configKey) return false;
    return explicit || target.configKey !== configKey;
  }

  private loadEventsFromConfig(explicit: boolean): void {
    const pickedFile = this.dataSelection.takePickedEventsFile();
    if (pickedFile) {
      this.loadPickedEventsFile(pickedFile);
      return;
    }
    const configured = this.configuredEvents();
    if (!configured) {
      console.log('[eventDisplay]: No event source configured, skipping.');
      return;
    }
    if (!this.isConfigLoadDue(this.eventsTarget, eventsSourceKey(configured), explicit)) {
      console.log(`[eventDisplay]: Events from '${configured.url}' need no load (shown, loading, or replaced by a deep link, command or picked file).`);
      return;
    }
    let load: Promise<unknown>;
    if (configured.kind === 'dex') {
      load = this.loadDexData(configured.url);
    } else {
      // The registered event loaders decide where the conversion runs (in the
      // browser for http/asset URLs, pyrobird for root:// and served paths);
      // they read the range and collections from config themselves. The
      // request starts here, so readiness and the spinner cover the loader's
      // own work too.
      const loader = this.eventLoaders.find(candidate => candidate.canLoad(configured.url));
      load = loader
        ? this.runEventsLoad('root', configured, () => loader.loadEvents(configured.url))
        : this.loadRootData(configured.url, configured.entries, this.collectionList(configured.collections));
    }
    load.catch(error => this.reportError(`Could not load events from '${configured.url}': ${errorText(error)}`));
  }

  private collectionList(collections: EventsSourceId['collections']): string[] | undefined {
    const groups = (Array.isArray(collections) ? collections : (collections ?? '').split(','))
      .map(group => group.trim()).filter(Boolean);
    return groups.length ? groups : undefined;
  }

  /** A picked/dropped local file: the loader that claims its name reads it in place. */
  private loadPickedEventsFile(file: File): void {
    const loader = this.eventLoaders.find(candidate => candidate.canLoad(file));
    if (!loader) {
      this.reportError(`No event loader claims the file '${file.name}'`);
      return;
    }
    this.runEventsLoad(isRootSource(file) ? 'root' : 'dex', undefined, () => loader.loadEvents(file))
      .catch(error => this.reportError(`Could not load events from '${file.name}': ${errorText(error)}`));
  }

  private loadGeometryFromConfig(explicit: boolean): void {
    const pickedFile = this.dataSelection.takePickedGeometryFile();
    const configured = this.configuredGeometry();
    if (!pickedFile) {
      if (!configured) {
        console.log('[eventDisplay]: No geometry configured, skipping.');
        return;
      }
      if (!this.isConfigLoadDue(this.geometryTarget, configured, explicit)) {
        console.log(`[eventDisplay]: Geometry '${configured}' needs no load (shown, loading, or replaced by a deep link, command or picked file).`);
        return;
      }
    }
    const source = pickedFile ?? configured;
    const name = typeof source === 'string' ? source : source.name;
    // A load still running (from another page visit) is superseded by this
    // one: GeometryService resolves the older request as cancelled
    this.loadGeometry(source)
      .then(result => {
        if (result.cancelled) console.log('[eventDisplay]: Geometry load superseded by a newer one.');
      })
      .catch(error => this.reportError(
        `Could not load geometry from '${name}': ${errorText(error)}. Open 'Configure' to choose another.`));
  }

  /**
   * Loads geometry and puts it on screen, replacing the current geometry.
   * When a newer geometry load starts before this one finishes, this one
   * resolves with `cancelled: true` and leaves the scene to the newer load.
   *
   * @throws Error with the reason when the geometry cannot be loaded.
   */
  async loadGeometry(url: string | File, scale = 10, clearGeometry = true): Promise<LoadedGeometry> {
    const generation = ++this.geometryGeneration;
    const target: LoadTarget = {key: typeof url === 'string' ? url.trim() : null, configKey: this.configuredGeometry()};
    this.geometryTarget = target;
    this.loadingGeometry.set(true);
    this.batchStatus.beginGeometryLoad();
    let loaded = false;
    try {
      const {threeGeometry} = await this.geomService.loadGeometry(url);
      if (!threeGeometry || generation !== this.geometryGeneration) return {root: null, cancelled: true};

      const sceneGeo = this.three.sceneGeometry;

      // There should be only one geometry if clearGeometry=true
      if (clearGeometry && sceneGeo.children.length > 0) {
        // The hover highlight parks a mesh's own material; give it back
        // first so the disposal reaches it.
        this.three.clearHoverHighlight();
        disposeHierarchy(sceneGeo, /* disposeSelf= */ false);
      }

      await this.geomService.postProcessing(threeGeometry, this.three.clipPlanes, {
        renderer: this.three.renderer,
        sceneGeometry: this.three.sceneGeometry,
        scene: this.three.scene,
      });
      // A newer load started during post-processing: the scene is its now
      if (generation !== this.geometryGeneration) return {root: null, cancelled: true};

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

      // Rebuilds the projection views' geometry copy (when a slice exists),
      // queues the picking BVHs and schedules the render that shows the new
      // geometry under on-demand rendering.
      this.three.geometryChanged();

      loaded = true;
      return {root: threeGeometry};
    } catch (error) {
      if (this.geometryTarget === target) this.geometryTarget = null;
      throw error;
    } finally {
      // Every path ends here, the superseded one included: a load that never
      // reports its end would keep window.firebird.ready false forever
      this.batchStatus.endGeometryLoad(loaded);
      if (generation === this.geometryGeneration) this.loadingGeometry.set(false);
    }
  }

  /**
   * Runs one events load as a request. From this call on the load counts for
   * readiness (`window.firebird`), shows its footer spinner, and supersedes
   * every earlier events request: a superseded load does not replace what is
   * on screen, no longer holds readiness back, and its end does not clear the
   * newer load's spinner. `work` receives the request to pass to
   * `showDexDocument()`, which shows the data only while the request is the
   * latest one.
   *
   * Loaders that do their own work before they have a DEX document (convert
   * a ROOT file, unzip a picked file) wrap that work in this call.
   *
   * @param kind Which footer spinner the load shows.
   * @param source What is loaded, when it has a name; a display remount does
   *   not load the same configured source again. Undefined for a picked file.
   * @param work The load; its result or error is passed through.
   */
  async runEventsLoad<T>(
    kind: 'dex' | 'root',
    source: EventsSourceId | string | undefined,
    work: (request: EventsLoadRequest) => Promise<T>,
  ): Promise<T> {
    const generation = ++this.eventsGeneration;
    const target: LoadTarget = {
      key: source === undefined ? null : eventsSourceKey(source),
      configKey: this.configuredEventsKey(),
    };
    this.eventsTarget = target;
    this.eventsLoading.set(kind);

    // Readiness waits for the latest request only
    this.releaseEventsReadiness?.();
    this.batchStatus.beginEventLoad();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.batchStatus.endEventLoad();
    };
    this.releaseEventsReadiness = release;

    const service = this;
    const request: EventsLoadRequest = {
      get isCurrent() { return generation === service.eventsGeneration; },
    };
    try {
      return await work(request);
    } catch (error) {
      if (this.eventsTarget === target) this.eventsTarget = null;
      throw error;
    } finally {
      release();
      if (this.releaseEventsReadiness === release) this.releaseEventsReadiness = null;
      if (generation === this.eventsGeneration) this.eventsLoading.set(null);
    }
  }

  /**
   * Fetches a DEX file (json or zip) and shows its first event.
   *
   * @returns The document, also when a newer load superseded this one and it
   *   was not shown.
   * @throws Error with the reason: HTTP status, unreadable zip, not DEX,
   *   unsupported DEX version (with the upgrade command), no events.
   */
  loadDexData(url: string): Promise<DataExchange> {
    return this.runEventsLoad('dex', url, async request => {
      const modelStart = performance.now();
      const data = await this.dataService.fetchDex(url);
      // modelMs includes fetch/unzip/parse; those are broken out by the
      // console.time lines of data-fetching.utils
      await this.showLoaded(data, request, performance.now() - modelStart);
      return data;
    });
  }

  /**
   * Shows a DEX document that is already in memory instead of fetching one -
   * the path taken by the in-browser ROOT converter, which produces DEX from a
   * local file or a byte-ranged URL without the app ever holding the file.
   *
   * @param dex A parsed DEX document.
   * @param source What it came from, when it has a name: recorded so a later
   *   configured auto-load of the same source is skipped. A local file has no
   *   name to compare and passes nothing.
   * @param request The request from `runEventsLoad()` when the caller started
   *   one; without it the document is a request of its own.
   * @returns The document, also when a newer load superseded this one and it
   *   was not shown.
   * @throws Error when the object is not DEX 1.0 or holds no events.
   */
  showDexDocument(dex: unknown, source?: EventsSourceId | string, request?: EventsLoadRequest): Promise<DataExchange> {
    const show = async (current: EventsLoadRequest) => {
      const modelStart = performance.now();
      const name = source === undefined ? undefined : (typeof source === 'string' ? source : source.url);
      const data = this.dataService.parseDex(dex, name);
      await this.showLoaded(data, current, performance.now() - modelStart);
      return data;
    };
    return request ? show(request) : this.runEventsLoad('dex', source, show);
  }

  /**
   * Converts ROOT events through the pyrobird convert endpoint and shows the
   * first one. The server detects EDM4eic or EDM4hep, and rejects a range
   * with any entry outside the file.
   *
   * @throws Error with the reason (HTTP status and the server's message).
   */
  loadRootData(url: string, eventRange: string = "0", collections?: string[]): Promise<DataExchange> {
    return this.runEventsLoad('root', {url, entries: eventRange, collections}, async request => {
      const modelStart = performance.now();
      const data = await this.dataService.fetchRootConversion(url, eventRange, collections);
      // modelMs includes the server conversion round trip
      await this.showLoaded(data, request, performance.now() - modelStart);
      return data;
    });
  }

  /**
   * The shared tail of every events load: waits for the lazy painters, then
   * adopts the events and shows the first one, unless a newer load was
   * requested meanwhile.
   *
   * @throws Error when the document holds no events.
   */
  private async showLoaded(data: DataExchange, request: EventsLoadRequest, modelMs: number): Promise<void> {
    if ((data.events?.length ?? 0) === 0) {
      throw new Error('The document holds no events');
    }
    await this.paintersReady;
    if (!request.isCurrent) {
      console.log('[eventDisplay]: A newer events load was requested; this result is not shown.');
      return;
    }
    this.dataService.adoptEvents(data);
    this.showEntry(data.events[0], modelMs);
  }

  /**
   * Puts the first entry of a load on screen through presentEntry(), with
   * [load-timing] stage accounting: model adoption (measured by the caller),
   * painter construction, paint, layers. The finer grain inside these stages
   * is logged by DataModelPainter and the painters.
   */
  private showEntry(entry: Event, modelMs: number): void {
    const start = performance.now();
    this.eventTime.set(null);
    this.presentEntry(entry);
    const end = performance.now();
    const totalMs = modelMs + end - start;
    if (totalMs > 100) {
      console.log(`[load-timing] show entry total ${totalMs.toFixed(1)} ms: ` +
        `model ${modelMs.toFixed(1)}, painters + paint + layers ${(end - start).toFixed(1)}`);
      // First frames after showing: the initial render compiles pipelines and
      // uploads buffers for every new object, a cost no stage above sees.
      // Two chained rAFs bracket one full frame of the render loop.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        console.log(`[load-timing] first rendered frame after show: +${(performance.now() - end).toFixed(1)} ms`);
      }));
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

      this.setTimeRange(minTime, maxTime);

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
    // The LOGICAL size (CSS pixels): setSize takes logical sizes and
    // multiplies by the pixel ratio; the canvas width/height are already
    // multiplied and would come back DPR-squared.
    const origSize = renderer.getSize(new Vector2());
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
      const totalEventTime = this.maxTime() - this.minTime();
      const effectiveStep = eventTimeStep * this.animationSpeed();
      const totalFrames = Math.ceil(totalEventTime / effectiveStep);

      for (let i = 0; i <= totalFrames; i++) {
        if (options.signal?.aborted) break;

        const currentTime = Math.min(this.minTime() + i * effectiveStep, this.maxTime());
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
        // Pixel ratio first: setPixelRatio re-applies the CURRENT logical
        // size, so the logical size must come last.
        renderer.setPixelRatio(origPixelRatio);
        renderer.setSize(origSize.x, origSize.y, false);
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
