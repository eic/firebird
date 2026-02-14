import {computed, effect, Injectable, linkedSignal, Signal, signal, WritableSignal} from '@angular/core';
import {Group as TweenGroup, Tween} from '@tweenjs/tween.js';
import {ThreeService} from './three.service';
import {GeometryService} from './geometry.service';
import {DataModelService} from './data-model.service';
import {ConfigService} from './config.service';
import {UrlService} from './url.service';


import {disposeHierarchy} from '../utils/three.utils';
import {ThreeEventProcessor} from '../data-pipelines/three-event.processor';
import {DataModelPainter, DisplayMode} from '../painters/data-model-painter';
import {AnimationManager} from "../animation/animation-manager";
import {initGroupFactories} from "../model/default-group-init";
import {Mesh, MeshBasicMaterial, SphereGeometry, Vector3} from "three";
import {arrangeEpicDetectors} from "../utils/epic-geometry-arranger";


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

  constructor(
    public three: ThreeService,
    private geomService: GeometryService,
    private config: ConfigService,
    private dataService: DataModelService,
    private urlService: UrlService
  ) {

    // Add event model factories (things that decode json to objects)
    initGroupFactories();

    // Connect painter to its scene place
    this.painter.setThreeSceneParent(this.three.sceneEvent);

    // Connect animation manager with threejs components
    this.animationManager = new AnimationManager(this.three.scene, this.three.camera, this.three.renderer);

    // On time change
    effect(() => {
      const time = this.eventTime();
      this.painter.paint(time);
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
  initThree(container: string | HTMLElement) {
    this.three.init(container);
    this.painter.setThreeSceneParent(this.three.sceneEvent);
    this.three.startRendering();

    // We need this to update the animation group
    this.three.addFrameCallback(() => {
      this.tweenGroup.update();
    })
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

    this.three.sceneEvent.add(...particles);

    const particleTweens = [];

    for (const particle of particles) {
      new Tween(particle.material, this.tweenGroup)
        .to({opacity: 1,},300,)
        .start();

      const particleToOrigin = new Tween(particle.position, this.tweenGroup)
        .to({z: 0,}, tweenDuration,)
        .onUpdate((time)=>{// Move camera closer to the target (what you're doing, but toward target)
          const direction = new Vector3();
          direction.subVectors(this.three.controls.target, this.three.camera.position).normalize();
          const zoomAmount = 3;
          this.three.camera.position.addScaledVector(direction, zoomAmount);  // positive = zoom in
        })
        .start();

      particleTweens.push(particleToOrigin);
    }

    particleTweens[0].onComplete(() => {
      this.three.sceneEvent.remove(...particles);
      onEnd?.();
    });
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
        trackInfo.newLine.geometry.instanceCount = Infinity;
      }
    }
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
   * Load geometry
   */
  async loadGeometry(url: string, scale = 10, clearGeometry = true) {
    this.lastLoadedGeometryUrl = null;
    let {rootGeometry, threeGeometry} = await this.geomService.loadGeometry(url);
    if (!threeGeometry) return;



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

    this.lastLoadedGeometryUrl = url;
  }

  async loadDexData(url: string) {
    this.lastLoadedDexUrl = null;
    const data = await this.dataService.loadDexData(url);
    if (data == null) {
      console.warn(
        'DataService.loadDexData() Received data is null or undefined'
      );
      return;
    }

    if (data.events?.length ?? 0 > 0) {
      this.painter.setEntry(data.events[0]);
      this.eventTime.set(null);
      this.painter.paint(this.eventTime());
      this.lastLoadedDexUrl = url;

    } else {
      console.warn('DataService.loadDexData() Received data had no entries');
      console.log(data);
    }
  }

  async loadRootData(url: string, eventRange: string = "0") {
    this.lastLoadedRootUrl = null;
    this.lastLoadedRootEventRange = null;
    const data = await this.dataService.loadRootData(url, eventRange);
    if (data == null) {
      console.warn(
        'DataService.loadRootData() Received data is null or undefined'
      );
      return;
    }

    if (data.events?.length ?? 0 > 0) {
      this.painter.setEntry(data.events[0]);
      this.eventTime.set(null);
      this.painter.paint(this.eventTime());
      this.lastLoadedRootUrl = url;
      this.lastLoadedRootEventRange = eventRange;
    } else {
      console.warn('DataService.loadRootData() Received data had no entries');
      console.log(data);
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
   */
  async captureFramesOffline(options: {
    width: number;
    height: number;
    eventTimeStep: number;       // event-time units per frame, e.g. 0.1
    includeCollision?: boolean;
    onProgress?: (current: number, total: number) => void;
    signal?: AbortSignal;
  }): Promise<Blob[]> {
    const { width, height, eventTimeStep, onProgress } = options;
    const renderer = this.three.renderer;

    // ── Save original state ──
    const origWidth = renderer.domElement.width;
    const origHeight = renderer.domElement.height;
    const origPixelRatio = renderer.getPixelRatio();
    const origCameraPos = this.three.camera.position.clone();
    const origTarget = this.three.controls.target.clone();

    // ── Force render resolution ──
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);

    const frames: Blob[] = [];

    const captureFrame = (): Promise<Blob> => {
      renderer.render(this.three.scene, this.three.camera);
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

        this.three.sceneEvent.add(electron, ion);

        // Opacity fade-in
        new Tween(electronMat, collGroup).to({ opacity: 1 }, 300).start(0);
        new Tween(ionMat, collGroup).to({ opacity: 1 }, 300).start(0);

        // Move to origin
        new Tween(electron.position, collGroup)
          .to({ z: 0 }, collisionDuration)
          .onUpdate(() => {
            const dir = new Vector3().subVectors(this.three.controls.target, this.three.camera.position).normalize();
            this.three.camera.position.addScaledVector(dir, 3);
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
      const totalEventTime = this.maxTime - this.minTime;
      const totalFrames = Math.ceil(totalEventTime / eventTimeStep);

      // Build offline tween group that replicates animateCurrentTime
      const timeGroup = new TweenGroup();
      const baseMsPerUnit = 200;
      const speed = this.animationSpeed;
      const duration = totalEventTime * (baseMsPerUnit / speed);
      const msPerFrame = eventTimeStep * (baseMsPerUnit / speed);

      const timeObj = { currentTime: this.minTime };

      new Tween(timeObj, timeGroup)
        .to({ currentTime: this.maxTime }, duration)
        .onUpdate((obj) => {
          this.eventTime.set(obj.currentTime);
          const dz = Math.max(obj.currentTime / 10, 25);
          if (obj.currentTime < 50) {
            const direction = new Vector3()
              .subVectors(this.three.controls.target, this.three.camera.position)
              .normalize();
            this.three.camera.position.addScaledVector(direction, -5);
          }
          this.three.camera.position.setZ(this.three.camera.position.z + dz);
          this.three.controls.target.setZ(this.three.controls.target.z + dz);
          this.three.camera.updateMatrix();
        })
        .start(0);

      for (let i = 0; i <= totalFrames; i++) {
        if (options.signal?.aborted) break;
        timeGroup.update(i * msPerFrame);
        frames.push(await captureFrame());
        onProgress?.(frames.length, totalFrames);
        await yieldFrame();
      }

    } finally {
      // ── Restore everything ──
      renderer.setSize(origWidth, origHeight, false);
      renderer.setPixelRatio(origPixelRatio);
      this.three.camera.position.copy(origCameraPos);
      this.three.controls.target.copy(origTarget);
      this.three.camera.updateMatrix();
    }

    return frames;
  }
}
