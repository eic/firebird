import {computed, effect, Injectable, linkedSignal, Signal, signal, WritableSignal} from '@angular/core';
import {Group as TweenGroup, Tween} from '@tweenjs/tween.js';
import {ThreeService} from './three.service';
import {GeometryService} from './geometry.service';
import {DataModelService} from './data-model.service';
import {LocalStorageService} from './local-storage.service';
import {UrlService} from './url.service';


import {disposeHierarchy} from '../utils/three.utils';
import {ThreeEventProcessor} from '../data-pipelines/three-event.processor';
import {DataModelPainter, DisplayMode} from '../painters/data-model-painter';
import {AnimationManager} from "../animation/animation-manager";
import {initGroupFactories} from "../model/default-group-init";
import {Mesh, MeshBasicMaterial, SphereGeometry} from "three";


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
    private settings: LocalStorageService,
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

    // Set geometry scale
    if (scale) {
      threeGeometry.scale.setScalar(scale);
    }

    const sceneGeo = this.three.sceneGeometry;

    // There should be only one geometry if clearGeometry=true
    if (clearGeometry && sceneGeo.children.length > 0) {
      disposeHierarchy(sceneGeo, /* disposeSelf= */ false);
    }

    this.geomService.postProcessing(threeGeometry, this.three.clipPlanes);

    sceneGeo.children.push(threeGeometry);
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
}
