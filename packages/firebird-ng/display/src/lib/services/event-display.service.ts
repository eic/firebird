import {computed, effect, inject, Injectable, signal, untracked, WritableSignal} from '@angular/core';
import {Subscription} from 'rxjs';
import {Group as TweenGroup, Tween} from '@tweenjs/tween.js';
import {ThreeService} from './three.service';
import {GeometryService} from './geometry.service';
import {DataModelService} from './data-model.service';
import {CommandBusService, ConfigProperty, ConfigService, resolveRegistry} from '@dexvis/app-features';
import {
  BatchStatusService,
  COLLISION_INTRO,
  CollisionIntro,
  DataSelectionService,
  DEX_EVENTS_SOURCE_CONFIG,
  EVENT_DATA_LAYER,
  GEOMETRY_URL_CONFIG,
  injectEventLoaders,
  injectGeometryLoaders,
  isRootSource,
  PAINTERS,
  ROOT_COLLECTIONS_CONFIG,
  ROOT_EVENT_RANGE_CONFIG,
  ROOT_EVENTS_SOURCE_CONFIG,
  UrlService,
} from '@dexvis/firebird-ng/api';
import {disposeHierarchy} from '@dexvis/threejs-tree-editor';
import {
  DataExchange,
  DataModelPainter,
  Event,
  PiecePainterConstructor,
  painterIdOf,
  sourceName,
  type DataSource,
  type EventDataLoader,
  type GeometryDataLoader,
  type LoaderContext,
} from '@dexvis/firebird-core';
import {Group, Object3D, Vector2, Vector3} from "three";
import {GeometryPostProcessingService} from "./geometry-post-processing.service";
import {PainterConfigService} from "./painter-config.service";
import type {RenderViewImpl} from "./render-view";
import {MessageService} from "./message.service";


/**
 * Identifies an events source the way the display compares sources: the URL,
 * plus for a ROOT file the entries and collection groups that were converted
 * (the same file with another range is another source).
 */
interface EventsSourceId {
  url: string;
  /** For a ROOT source: entry numbers as typed ('0', '0-4', '1,3'). */
  entries?: string;
  /** For a ROOT source: collection groups, a comma list or an array; empty means all. */
  collections?: string | string[];
}

/** One requested events load (see `EventDisplayService.runEventsLoad()`). */
interface EventsLoadRequest {
  /** False once a newer events load was requested; its data is then not shown. */
  readonly isCurrent: boolean;
}

/** Options of `EventDisplayService.attach()`. */
export interface DisplayAttachOptions {
  /**
   * Loads the configured geometry and events once attached. Default true.
   * The queued startup commands run either way.
   */
  autoLoad?: boolean;
  /**
   * Runs once the renderer is attached, before the configured sources load:
   * host setup that needs the scene, such as extra views. A function it
   * returns runs when the disposer is called.
   */
  onAttached?: () => void | (() => void);
}

/** What a load request loads, and the configured source when it was requested. */
interface LoadTarget {
  /** The source's key; null for a picked file or an unnamed document. */
  key: string | null;
  /** The configured source's key ('' for none) at request time. */
  configKey: string;
}

/** The comparison key of an events source; see EventsSourceId. */
function eventsSourceKey(source: EventsSourceId): string {
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


  // Time animation. Every tween leaves the group when it completes or
  // stops: tween.js keeps finished tweens in a group until removed.
  private tweenGroup = new TweenGroup();
  private tween: Tween<any> | null = null;

  /** The collision intro playing now (it ends early on a new playback). */
  private introTween: Tween<{elapsed: number}> | null = null;
  /** The registered collision intro (withCollisionIntro); null when none. */
  private readonly collisionIntroLoader = inject(COLLISION_INTRO, {optional: true});
  private collisionIntroClass: Promise<(new () => CollisionIntro) | null> | null = null;
  /** True when a collision intro is registered: offline recordings offer it. */
  readonly hasCollisionIntro = this.collisionIntroLoader !== null;

  // Painter that draws the event
  private painter: DataModelPainter = new DataModelPainter();

  /** Experiment-specific geometry adjustments (withGeometryPostProcessor). */
  private geometryPostProcessing = inject(GeometryPostProcessingService);

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
  /** Registered loaders (withGeometryLoader, withEventLoader), asked in registration order. */
  private geometryLoaders = injectGeometryLoaders();
  private eventLoaders = injectEventLoaders();
  /** Aborts the latest geometry / events load when a newer one starts. */
  private geometryAbort: AbortController | null = null;
  private eventsAbort: AbortController | null = null;

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
    // Every load awaits paintersReady.
    this.paintersReady = this.registerPainters(inject(PAINTERS, {optional: true}) ?? []);

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
   * Registers the contributed painters in REGISTRATION order once every
   * lazy chunk resolved: the first painter registered for a piece type is
   * its default, and the order the chunks happen to arrive in must not
   * change that. A later painter with the `meta.id` of an earlier one for
   * the same type replaces it in place. A painter module that fails to load,
   * or a painter that declares reserved knob names, is reported once and
   * left out; its pieces fall back to another registered painter or stay
   * undrawn.
   */
  private async registerPainters(registrations: ReadonlyArray<{
    forPieceType: string;
    painterClass?: PiecePainterConstructor;
    load?: () => Promise<PiecePainterConstructor>;
  }>): Promise<void> {
    const classes = await Promise.all(registrations.map(async registration => {
      try {
        return registration.painterClass ?? await registration.load?.() ?? null;
      } catch (error) {
        this.reportError(`The painter for '${registration.forPieceType}' pieces failed to load: ${errorText(error)}`);
        return null;
      }
    }));
    const classesByType = new Map<string, PiecePainterConstructor[]>();
    registrations.forEach((registration, index) => {
      const painterClass = classes[index];
      if (!painterClass) return;
      const list = classesByType.get(registration.forPieceType) ?? [];
      list.push(painterClass);
      classesByType.set(registration.forPieceType, list);
    });
    for (const [pieceType, painterClasses] of classesByType) {
      for (const painterClass of resolveRegistry(painterClasses, painterIdOf)) {
        try {
          this.painter.registerPainter(pieceType, painterClass);
        } catch (error) {
          this.reportError(`The painter for '${pieceType}' pieces was not registered: ${errorText(error)}`);
        }
      }
    }
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
   * Puts the display into `host`: the shared canvas and the main view move
   * there, the canvas follows the host's size, the configured geometry and
   * events load, and the queued startup commands run (deep links, server
   * startup commands, batch). The services and the scene outlive the host:
   * attaching again later (a page revisit) moves the same scene back, and the
   * configured sources reload only when they changed (see loadFromConfig).
   *
   * The renderer starts asynchronously. A host disposed before it started is
   * never set up, and only the latest attached host keeps the canvas.
   *
   * @returns The disposer: call it when the host goes away. It runs the
   *   cleanup `onAttached` returned and stops the render loop until the
   *   next host attaches.
   */
  attach(host: HTMLElement, options: DisplayAttachOptions = {}): () => void {
    let disposed = false;
    let hostCleanup: (() => void) | void = undefined;
    let resizeObserver: ResizeObserver | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    // The host's size comes from the page layout (panes, window), never from
    // the canvas inside it, so observing it cannot feed back
    const fitCanvas = () => this.three.setSize(host.clientWidth, host.clientHeight);

    this.initThree(host)
      .then(attached => {
        if (!attached || disposed) return;
        hostCleanup = options.onAttached?.();
        // Debounced: dragging a pane resizes the host every animation frame
        resizeObserver = new ResizeObserver(() => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(fitCanvas, 50);
        });
        resizeObserver.observe(host);
        fitCanvas();
        if (options.autoLoad ?? true) {
          this.autoLoadAndRunStartup();
        } else {
          void this.runStartupCommands();
        }
      })
      .catch(error => this.reportError(`The display failed to start: ${errorText(error)}`));

    return () => {
      if (disposed) return;
      disposed = true;
      hostCleanup?.();
      resizeObserver?.disconnect();
      clearTimeout(resizeTimer);
      // The data selector's Show reloads only while a display is attached
      this.dataSelection.detachDisplay();
      this.three.detach();
    };
  }

  /**
   * Moves the scene into `container` and wires the display services.
   * Resolves to false when another attach or a detach superseded this one
   * while the renderer initialized: the caller must then skip its own setup.
   */
  private async initThree(container: HTMLElement): Promise<boolean> {
    // init() starts the render loop. It reports false when the host went
    // away (or another host attached) while it waited.
    if (!await this.three.init(container)) return false;
    // The data selector's Show button reloads through the same config path
    // the startup uses (see loadFromConfig). Attached only while a display
    // is mounted: the config page applies without a display, and the next
    // display host then loads on its own attach.
    this.dataSelection.attachDisplay(parts => this.loadFromConfig(parts));
    this.painter.setThreeSceneParent(this.three.sceneEvent);

    // Advances the tween group each frame. A stable bound member, not an
    // inline closure: initThree runs once per attach, and addFrameCallback
    // deduplicates by function identity: an inline closure would stack one
    // registration per page visit.
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
   * stopped or completed. Each tween's onComplete/onStop removes it from the
   * group: tween.js keeps ended tweens in a group (update() defaults to
   * preserve=true), and the group would grow with every animation. */
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


  /** Stops the time animation, and a collision intro that would start one when it ends. */
  stopTimeAnimation(): void {
    // onStop takes each tween out of the tween group
    this.introTween?.stop();
    if (this.tween) {
      this.tween.stop();
      this.tween = null;
    }
  }

  rewindTime() {
    this.updateEventTime(0);
  }

  animateCurrentTime(targetTime: number, duration: number): void {
    if (this.tween) {
      this.stopTimeAnimation();
    }

    const tween: Tween<{currentTime: number}> = new Tween({currentTime: this.eventTime() ?? this.minTime()}, this.tweenGroup)
      .to({currentTime: targetTime}, duration)
      .onUpdate((obj) => {
        this.eventTime.set(obj.currentTime);
        if (this.animateCameraMovement) {
          this.followTimeWithCamera(obj.currentTime);
        }
      }).onStop((time)=>{
        this.tweenGroup.remove(tween);
        console.log(`[eventDisplay]: time animation stopped at: ${time}`);
      }).onComplete(()=>{
        this.tweenGroup.remove(tween);
        if (this.tween === tween) this.tween = null;
        if(this.animationIsCycling()) {
          this.dataService.setNextEntry();
          setTimeout(() => { void this.animateWithCollision();}, 1);
        }
      })
      .start();
    this.tween = tween;

    // Seed the render-on-demand chain: the first rendered frame advances the
    // tween, whose update re-invalidates until it completes.
    this.three.invalidate();
  }

  /**
   * Camera motion of `animateCameraMovement` during the time animation: the
   * camera and its target travel along the beam (+Z) with the event time,
   * zooming in during the first 50 ns.
   */
  private followTimeWithCamera(time: number): void {
    const dz = Math.max(time / 10, 25);
    if (time < 50) {
      this.dollyCamera(-5);
    }
    this.three.camera.position.setZ(this.three.camera.position.z + dz);
    this.three.controls.target.setZ(this.three.controls.target.z + dz);
    this.three.camera.updateMatrix();
  }

  /** Moves the main camera `distance` mm toward its orbit target (negative: away). */
  private dollyCamera(distance: number): void {
    const direction = new Vector3().subVectors(this.three.controls.target, this.three.camera.position).normalize();
    this.three.camera.position.addScaledVector(direction, distance);
  }

  /** The registered collision intro class, loaded once; null when none is registered or it failed to load. */
  private loadCollisionIntro(): Promise<(new () => CollisionIntro) | null> {
    this.collisionIntroClass ??= this.collisionIntroLoader
      ? this.collisionIntroLoader().catch(error => {
        this.reportError(`The collision intro failed to load: ${errorText(error)}`);
        return null;
      })
      : Promise.resolve(null);
    return this.collisionIntroClass;
  }

  /**
   * Adds an intro's objects to the event data: a group under sceneEvent on
   * the event layer (never clipped, drawn in every view).
   *
   * @returns The group, to remove when the intro ends.
   */
  private beginCollisionIntro(intro: CollisionIntro): Group {
    const group = new Group();
    group.name = 'CollisionIntro';
    intro.begin(group);
    this.three.addEventObject(group);
    return group;
  }

  private endCollisionIntro(intro: CollisionIntro, group: Group): void {
    intro.end();
    this.three.sceneEvent.remove(group);
    this.three.invalidate();
  }

  /**
   * Plays the collision intro (`withCollisionIntro`), then the time
   * animation from the start. Without a registered intro the time animation
   * starts at once. The `animate-collision` command calls this.
   */
  async animateWithCollision(): Promise<void> {
    // Stop after the await: a playback requested meanwhile has started its
    // intro by then, and this one replaces it
    const IntroClass = await this.loadCollisionIntro();
    this.stopTimeAnimation();
    this.rewindTime();
    if (!IntroClass) {
      this.animateTime();
      return;
    }

    // The tween group drives the intro: the render loop advances it on every
    // rendered frame (tweenFrameCallback), and its updates keep the frames
    // coming until it ends.
    const intro = new IntroClass();
    const group = this.beginCollisionIntro(intro);
    const finish = () => {
      this.tweenGroup.remove(tween);
      if (this.introTween === tween) this.introTween = null;
      this.endCollisionIntro(intro, group);
    };
    const tween: Tween<{elapsed: number}> = new Tween({elapsed: 0}, this.tweenGroup)
      .to({elapsed: intro.durationMs}, intro.durationMs)
      .onUpdate(({elapsed}) => {
        intro.update(elapsed);
        if (this.animateCameraMovement) this.dollyCamera(3);
      })
      .onStop(finish)
      .onComplete(() => {
        finish();
        this.animateTime();
      })
      .start();
    this.introTween = tween;
    // Seed the render-on-demand chain (see animateCurrentTime).
    this.three.invalidate();
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
  //
  // Every load goes through the loader registries (withGeometryLoader,
  // withEventLoader): the first registered loader whose canLoad() claims the
  // source returns the data, and this service alone puts it on screen. The
  // same path serves the config keys, picked files, the data selector's Show,
  // the open-geometry / open-dex commands and packs.

  /**
   * Config-driven auto-load with startup-command awareness: the one code
   * path every display host uses, so landing on any of them covers the same
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
  private autoLoadAndRunStartup(): void {
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
  private async runStartupCommands(): Promise<void> {
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
   * DataSelectionService.apply) calls it, and attach() shares its parts.
   *
   * @param parts Which halves to load; both by default.
   * @param options.explicit True (the default) loads every configured source
   *   that is not what the display already shows or is loading. False is the
   *   remount rule of attach().
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
   * ROOT key. The data selector keeps only one of the two keys set.
   */
  private configuredEventsUrl(): string {
    const dex = (this.config.declare(DEX_EVENTS_SOURCE_CONFIG).value || '').trim();
    return dex || (this.config.declare(ROOT_EVENTS_SOURCE_CONFIG).value || '').trim();
  }

  /**
   * How the display compares an events source with what it shows: the URL,
   * plus for a ROOT file the configured entry range and collection groups
   * (the same file with another range is another source). Undefined for a
   * picked file, which has no name to compare.
   */
  private eventsSourceIdOf(source: DataSource): EventsSourceId | undefined {
    if (typeof source !== 'string') return undefined;
    if (!isRootSource(source)) return {url: source};
    return {
      url: source,
      entries: this.config.declare(ROOT_EVENT_RANGE_CONFIG).value || ROOT_EVENT_RANGE_CONFIG.default,
      collections: this.config.declare(ROOT_COLLECTIONS_CONFIG).value || '',
    };
  }

  private configuredEventsKey(): string {
    const url = this.configuredEventsUrl();
    return url ? eventsSourceKey(this.eventsSourceIdOf(url)!) : '';
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
    const source = this.dataSelection.takePickedEventsFile() ?? this.configuredEventsUrl();
    if (!source) {
      console.log('[eventDisplay]: No event source configured, skipping.');
      return;
    }
    if (typeof source === 'string' && !this.isConfigLoadDue(this.eventsTarget, this.configuredEventsKey(), explicit)) {
      console.log(`[eventDisplay]: Events from '${source}' need no load (shown, loading, or replaced by a deep link, command or picked file).`);
      return;
    }
    this.openEvents(source)
      .catch(error => this.reportError(`Could not load events from '${sourceName(source)}': ${errorText(error)}`));
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
    // A load still running (from another page visit) is superseded by this one
    this.openGeometry(source)
      .then(root => {
        if (!root) console.log('[eventDisplay]: Geometry load superseded by a newer one.');
      })
      .catch(error => this.reportError(
        `Could not load geometry from '${sourceName(source)}': ${errorText(error)}. Open 'Configure' to choose another.`));
  }

  /**
   * The first registered loader that claims `source` by its name.
   *
   * @throws Error naming the source and the formats the loaders know.
   */
  private claimingLoader<T extends GeometryDataLoader | EventDataLoader>(loaders: T[], source: DataSource, kind: string): T {
    const loader = loaders.find(candidate => candidate.canLoad(source));
    if (!loader) {
      const known = loaders.map(known => `${known.meta.label} (${known.meta.fileExtensions.join(', ')})`).join('; ');
      throw new Error(`No ${kind} loader claims '${sourceName(source)}'. Known formats: ${known || 'none'}`);
    }
    return loader;
  }

  /** What a loader gets with each load; `signal` aborts when a newer load of the kind starts. */
  private loaderContext(signal: AbortSignal): LoaderContext {
    return {
      resolveUrl: url => this.urlService.resolveDownloadUrl(url),
      signal,
    };
  }

  /**
   * Loads detector geometry through the first registered geometry loader
   * that claims the source, and puts it on screen in place of the current
   * geometry: scaled to millimeters, themed, post-processed, copied into the
   * projection views' geometry slice. Starting a newer geometry load aborts
   * this one.
   *
   * @returns The geometry root, or null when a newer geometry load replaced
   *   this one (that load owns the screen).
   * @throws Error with the reason: no loader claims the source, or the
   *   loader's failure.
   */
  async openGeometry(source: DataSource): Promise<Object3D | null> {
    const loader = this.claimingLoader(this.geometryLoaders, source, 'geometry');
    const generation = ++this.geometryGeneration;
    this.geometryAbort?.abort();
    const abort = new AbortController();
    this.geometryAbort = abort;
    const target: LoadTarget = {key: typeof source === 'string' ? source.trim() : null, configKey: this.configuredGeometry()};
    this.geometryTarget = target;
    this.loadingGeometry.set(true);
    this.batchStatus.beginGeometryLoad();
    let shown = false;
    try {
      const root = await loader.load(source, this.loaderContext(abort.signal));
      if (generation !== this.geometryGeneration) return null;
      shown = await this.showGeometry(root, loader.millimetersPerUnit ?? 1, generation);
      return shown ? root : null;
    } catch (error) {
      // A replaced load ends with its loader's abort: not a failure
      if (generation !== this.geometryGeneration) return null;
      if (this.geometryTarget === target) this.geometryTarget = null;
      throw error;
    } finally {
      // Every path ends here, the superseded one included: a load that never
      // reports its end would keep window.firebird.ready false forever
      this.batchStatus.endGeometryLoad(shown);
      if (generation === this.geometryGeneration) {
        this.loadingGeometry.set(false);
        this.geometryAbort = null;
      }
    }
  }

  /**
   * Replaces the geometry on screen with `root`, unless a newer geometry load
   * starts meanwhile.
   *
   * @param millimetersPerUnit The loader's length unit (ROOT: 10).
   * @returns False when a newer load superseded this one.
   */
  private async showGeometry(root: Object3D, millimetersPerUnit: number, generation: number): Promise<boolean> {
    const sceneGeometry = this.three.sceneGeometry;

    // One geometry at a time. The hover highlight parks a mesh's own
    // material; give it back first so the disposal reaches it.
    if (sceneGeometry.children.length > 0) {
      this.three.clearHoverHighlight();
      disposeHierarchy(sceneGeometry, /* disposeSelf= */ false);
    }

    await this.geomService.postProcessing(root, this.three.clipPlanes);
    // A newer load started during post-processing: the scene is its now
    if (generation !== this.geometryGeneration) return false;

    sceneGeometry.add(root);
    // The container carries the unit: post-processors that regroup nodes
    // directly under it keep the scale
    sceneGeometry.scale.setScalar(millimetersPerUnit);
    // Worker-built geometry has matrixAutoUpdate off: update the matrices by hand
    sceneGeometry.updateMatrix();
    sceneGeometry.updateMatrixWorld(true);
    this.geomService.geometry.set(root);

    // Experiment-specific adjustments (withGeometryPostProcessor). They see
    // the geometry in place and scaled, before the first frame shows it.
    const failures = await this.geometryPostProcessing.process({
      geometry: root,
      sceneGeometry,
      scene: this.three.scene,
      renderer: this.three.renderer,
      clippingPlanes: this.three.clipPlanes,
      fastMaterials: this.geomService.geometryFastAndUgly.value,
    });
    for (const failure of failures) {
      this.reportError(`Geometry post-processor '${failure.id}' failed: ${errorText(failure.error)}`);
    }
    // A newer load started meanwhile: it replaces this geometry when it ends
    if (generation !== this.geometryGeneration) return false;

    // Rebuilds the projection views' geometry copy (when a slice exists),
    // queues the picking BVHs and schedules the render that shows the new
    // geometry under on-demand rendering.
    this.three.geometryChanged();
    return true;
  }

  /**
   * Loads events through the first registered event loader that claims the
   * source, and shows the first event. Starting a newer events load (or
   * showDexDocument) aborts this one.
   *
   * @returns The events, or null when a newer events load replaced this one.
   * @throws Error with the reason: no loader claims the source, the loader's
   *   failure (HTTP status, unsupported DEX version, ...), no events.
   */
  async openEvents(source: DataSource): Promise<DataExchange | null> {
    const loader = this.claimingLoader(this.eventLoaders, source, 'event');
    const kind = isRootSource(source) ? 'root' : 'dex';
    return this.runEventsLoad(kind, this.eventsSourceIdOf(source), async (request, signal) => {
      const start = performance.now();
      const data = await loader.loadEvents(source, this.loaderContext(signal));
      // modelMs includes fetch, conversion and parsing; data-fetching.utils
      // logs the finer stages
      return this.showLoaded(data, request, performance.now() - start);
    });
  }

  /**
   * Shows a DEX document that is already in memory, such as one a pack
   * produced: parses it and shows its first event, as a new events load.
   *
   * @param source What the document came from, for messages and so that a
   *   later configured load of the same source is skipped.
   * @returns The parsed events, or null when a newer events load replaced
   *   this one first.
   * @throws Error when the object is not DEX 1.0 or holds no events.
   */
  showDexDocument(dex: unknown, source?: string): Promise<DataExchange | null> {
    return this.runEventsLoad('dex', source === undefined ? undefined : {url: source}, async request => {
      const start = performance.now();
      const data = this.dataService.parseDex(dex, source);
      return this.showLoaded(data, request, performance.now() - start);
    });
  }

  /**
   * Runs one events load as a request. From this call on the load counts for
   * readiness (`window.firebird`), shows its footer spinner, and supersedes
   * every earlier events request: a superseded load is aborted, does not
   * replace what is on screen, no longer holds readiness back, and its end
   * does not clear the newer load's spinner.
   *
   * @param kind Which footer spinner the load shows.
   * @param source What is loaded, when it has a name; a display remount does
   *   not load the same configured source again.
   * @param work The load. It receives the request (for showLoaded) and the
   *   signal that aborts when a newer request starts.
   * @returns What `work` returns, or null when a newer request superseded it.
   */
  private async runEventsLoad<T>(
    kind: 'dex' | 'root',
    source: EventsSourceId | undefined,
    work: (request: EventsLoadRequest, signal: AbortSignal) => Promise<T>,
  ): Promise<T | null> {
    const generation = ++this.eventsGeneration;
    this.eventsAbort?.abort();
    const abort = new AbortController();
    this.eventsAbort = abort;
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
      const result = await work(request, abort.signal);
      return request.isCurrent ? result : null;
    } catch (error) {
      // A replaced load ends with its loader's abort: not a failure
      if (!request.isCurrent) return null;
      if (this.eventsTarget === target) this.eventsTarget = null;
      throw error;
    } finally {
      release();
      if (this.releaseEventsReadiness === release) this.releaseEventsReadiness = null;
      if (generation === this.eventsGeneration) {
        this.eventsLoading.set(null);
        this.eventsAbort = null;
      }
    }
  }

  /**
   * The shared tail of every events load: waits for the lazy painters, then
   * adopts the events and shows the first one, unless a newer load was
   * requested meanwhile.
   *
   * @throws Error when the document holds no events.
   */
  private async showLoaded(data: DataExchange, request: EventsLoadRequest, modelMs: number): Promise<DataExchange> {
    if ((data.events?.length ?? 0) === 0) {
      throw new Error('The document holds no events');
    }
    await this.paintersReady;
    if (!request.isCurrent) {
      console.log('[eventDisplay]: A newer events load was requested; this result is not shown.');
      return data;
    }
    this.dataService.adoptEvents(data);
    this.showEntry(data.events[0], modelMs);
    return data;
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
    /** Record the collision intro first, when one is registered (`withCollisionIntro`). */
    includeCollision?: boolean;
    onProgress?: (current: number, total: number) => void;
    signal?: AbortSignal;
    views?: RenderViewImpl[];
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
      // ── Phase 1: the collision intro (optional, when one is registered) ──
      // The same intro the live path plays, stepped at 60 fps of intro time
      const IntroClass = options.includeCollision ? await this.loadCollisionIntro() : null;
      if (IntroClass) {
        const intro = new IntroClass();
        const msPerFrame = 1000 / 60;
        const introFrames = Math.ceil(intro.durationMs / msPerFrame);

        // Reset state
        this.rewindTime();
        this.three.camera.position.copy(origCameraPos);
        this.three.controls.target.copy(origTarget);

        const group = this.beginCollisionIntro(intro);
        try {
          for (let i = 0; i <= introFrames; i++) {
            if (options.signal?.aborted) break;
            intro.update(Math.min(i * msPerFrame, intro.durationMs));
            if (this.animateCameraMovement) this.dollyCamera(3);
            frames.push(await captureFrame());
            onProgress?.(frames.length, -1); // indeterminate total during the intro
            await yieldFrame();
          }
        } finally {
          this.endCollisionIntro(intro, group);
        }
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

        // Camera movement (matches the live time animation)
        if (this.animateCameraMovement) {
          this.followTimeWithCamera(currentTime);
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
