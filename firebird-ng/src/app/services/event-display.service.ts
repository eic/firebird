import { Injectable, signal, effect, Signal, WritableSignal } from '@angular/core';

import {Color, DoubleSide, MeshLambertMaterial, NormalBlending, Scene, Vector3} from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { ThreeService } from './three.service';
import { GeometryService } from './geometry.service';
import { DataModelService } from './data-model.service';
import { UserConfigService } from './user-config.service';
import { UrlService } from './url.service';

import {disposeHierarchy, disposeNode, getColorOrDefault} from '../utils/three.utils';
import { ThreeGeometryProcessor } from '../data-pipelines/three-geometry.processor';
import { ThreeEventProcessor } from '../data-pipelines/three-event.processor';
import { DataModelPainter } from '../painters/data-model-painter';
import {AnimationManager} from "../animation/animation-manager";


@Injectable({
  providedIn: 'root',
})
export class EventDisplayService {

  private eventsByName = new Map<string, any>();
  private eventsArray: any[] = [];
  selectedEventKey: string | undefined;

  // Time
  private eventTime: WritableSignal<number> = signal(0);
  public readonly eventTime$: Signal<number> = this.eventTime.asReadonly();
  public maxTime = 200;
  public minTime = 0;

  // Time animation
  private tween: TWEEN.Tween<any> | null = null;
  private beamAnimationTime: number = 1000;

  // Geometry
  private threeGeometryProcessor = new ThreeGeometryProcessor();
  private defaultColor: Color = new Color(0x68698D);
  currentGeometry: string = 'All';
  private animateEventAfterLoad: boolean = false;
  private trackInfos: any | null = null; // Replace 'any' with the actual type

  // Painter that draws the event
  private painter: DataModelPainter = new DataModelPainter();

  // Animation manager
  private animationManager: AnimationManager;

  constructor(
    public three: ThreeService,
    private geomService: GeometryService,
    private settings: UserConfigService,
    private dataService: DataModelService,
    private urlService: UrlService
  ) {
    // Effect to update when eventTime changes
    effect(() => {
      this.processCurrentTimeChange(this.eventTime());
      this.painter.paint(this.eventTime());
    });

    this.animationManager = new AnimationManager(this.three.scene, this.three.camera, this.three.renderer);
  }

  // ****************************************************
  // *************** THREE SETUP ************************
  // ****************************************************

  /**
   * Initialize the default three.js scene
   * @param container
   */
  initThree(container: string|HTMLElement) {
    this.three.init(container);
    this.painter.setThreeSceneParent(this.three.sceneEvent);
    this.three.startRendering();
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

  animateTime() {
    this.animateCurrentTime(
      this.maxTime,
      (this.maxTime - this.eventTime()) * 200
    );
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
    this.tween = new TWEEN.Tween({ currentTime: this.eventTime() })
      .to({ currentTime: targetTime }, duration)
      .onUpdate((obj) => {
        this.updateEventTime(obj.currentTime);
      })
      // .easing(TWEEN.Easing.Quadratic.In) // This can be changed to other easing functions
      .start();
  }

  animateWithCollision() {
    this.stopTimeAnimation();
    this.rewindTime();
    if (this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = false;
      }
    }
    // TODO
    // this.animationManager?.collideParticles(
    //   this.beamAnimationTime,
    //   30,
    //   5000,
    //   new Color(0xaaaaaa),
    //   () => {
    //     this.animateTime();
    //   }
    // );
  }

  timeStepBack() {
    if (this.eventTime() > this.minTime) this.updateEventTime(this.eventTime() - 1);
    if (this.eventTime() < this.minTime) this.updateEventTime(this.minTime);
  }

  timeStep() {
    if (this.eventTime() < this.maxTime) this.updateEventTime(this.eventTime() + 1);
    if (this.eventTime() > this.maxTime) this.updateEventTime(this.maxTime);
  }

  exitTimedDisplay() {
    this.stopTimeAnimation();
    this.rewindTime();
    this.painter.paint(null);
    this.animateEventAfterLoad = false;
    if (this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = true;
        trackInfo.newLine.geometry.instanceCount = Infinity;
      }
    }
  }

  // ****************************************************
  // *************** DATA LOADING ***********************
  // ****************************************************

  /**
   * Load geometry
   * @param scale
   */
  async loadGeometry(scale = 10, clearGeometry=true) {
    let { rootGeometry, threeGeometry } = await this.geomService.loadGeometry();
    if (!threeGeometry) return;

    // Set geometry scale
    if (scale) {
      threeGeometry.scale.setScalar(scale);
    }

    const sceneGeo = this.three.sceneGeometry;

    // There should be only one geometry if clearGeometry=true
    if(clearGeometry && sceneGeo.children.length > 0) {
      disposeHierarchy(sceneGeo, /* disposeSelf= */ false);
    }

    sceneGeo.add(threeGeometry);

    // Now we want to set default materials
    sceneGeo.traverse((child: any) => {
      if (child.type !== 'Mesh' || !child?.material?.isMaterial) {
        return;
      }

      // Assuming `getObjectSize` is correctly typed and available
      child.userData['size'] = 1; //this.importManager.getObjectSize(child);

      // Handle the material of the child
      const color = getColorOrDefault(child.material, this.defaultColor);
      const side = DoubleSide;

      let opacity = threeGeometry.userData['opacity'] ?? 1;

      child.material = new MeshLambertMaterial({
        color: color,
        side: side,
        transparent: true,
        opacity: 0.7,
        blending: NormalBlending,
        depthTest: true,
        depthWrite: true,
        clippingPlanes: this.three.clipPlanes,
        clipIntersection: true,
        clipShadows: false,
      });

      // Material
      let name: string = child.name;

      if (!child.material?.clippingPlanes !== undefined) {
        child.material.clippingPlanes = this.three.clipPlanes;
      }

      if (!child.material?.clipIntersection !== undefined) {
        child.material.clipIntersection = true;
      }

      if (!child.material?.clipShadows !== undefined) {
        child.material.clipShadows = false;
      }
    });

    // HERE WE DO POSTPROCESSING STEP
    this.threeGeometryProcessor.process(this.geomService.subdetectors);

    // Now we want to change the materials
    sceneGeo.traverse((child: any) => {
      if (!child?.material?.isMaterial) {
        return;
      }

      if (child.material?.clippingPlanes !== undefined) {
        child.material.clippingPlanes = this.three.clipPlanes;
      }

      if (child.material?.clipIntersection !== undefined) {
        child.material.clipIntersection = true;
      }

      if (child.material?.clipShadows !== undefined) {
        child.material.clipShadows = false;
      }
    });

    // TODO do we need it?
    //this.three.renderer.sortObjects = false;

    // FIXME This needs to be fixed, it causes a crash
    // produceRenderOrder(this.scene, this.camera.position, 'ray');
  }

  /**
   * Load events
   * @private
   */
  private loadEvents() {
    let eventSource = this.settings.trajectoryEventSource.value;
    eventSource = this.urlService.resolveDownloadUrl(eventSource);
    let eventConfig = {
      eventFile:
        'https://firebird-eic.org/py8_all_dis-cc_beam-5x41_minq2-100_nevt-5.evt.json.zip',
      eventType: 'zip',
    };
    if (
      eventSource != 'no-events' &&
      !eventSource.endsWith('edm4hep.json')
    ) {
      let eventType = eventSource.endsWith('zip') ? 'zip' : 'json';
      let eventFile = eventSource;
      eventConfig = { eventFile, eventType };
    }

    if (typeof Worker !== 'undefined') {
      // Create a new
      const worker = new Worker(
        new URL('../workers/event-loader.worker.ts', import.meta.url)
      );
      worker.onmessage = ({ data }) => {
        for (let key in data) {
          this.eventsByName.set(key, data[key]);
          this.eventsArray.push(data[key]);
        }
      };
      worker.postMessage(eventConfig.eventFile);
    } else {
      // Web workers are not supported in this environment.
    }
  }

  public loadEvent(eventName: string) {
    const event = this.eventsByName.get(eventName);
    if (event) {
      this.buildEventDataFromJSON(event);
    }
  }

  /**
   * Load data from EDM4HEP
   */
  async loadEdm4hepData() {
    const data = await this.dataService.loadEdm4EicData();

    if (data == null) {
      console.warn(
        'DataService.loadEdm4EicData() Received data is null or undefined'
      );
      return;
    }

    if (data.entries?.length ?? 0 > 0) {
      this.painter.setEntry(data.entries[0]);
      this.painter.paint(this.eventTime());
    } else {
      console.warn(
        'DataService.loadEdm4EicData() Received data had no entries'
      );
      console.log(data);
    }
  }

  async loadDexData() {
    const data = await this.dataService.loadDexData();
    if (data == null) {
      console.warn(
        'DataService.loadDexData() Received data is null or undefined'
      );
      return;
    }

    if (data.entries?.length ?? 0 > 0) {
      this.painter.setEntry(data.entries[0]);
      this.painter.paint(this.eventTime());
    } else {
      console.warn('DataService.loadDexData() Received data had no entries');
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
  private processCurrentTimeChange(value: number) {
    let partialTracks: any[] = []; // Replace 'any' with the actual type
    if (this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        if (trackInfo.startTime > value) {
          trackInfo.trackNode.visible = false;
        } else {
          trackInfo.trackNode.visible = true;
          trackInfo.newLine.geometry.instanceCount = trackInfo.positions.length;

          if (trackInfo.endTime > value) {
            partialTracks.push(trackInfo);
          } else {
            // track should be visible fully
            trackInfo.newLine.geometry.instanceCount = Infinity;
          }
        }
      }
    }

    if (partialTracks.length > 0) {
      for (let trackInfo of partialTracks) {
        let geometryPosCount = trackInfo.positions.length;

        //if (!geometryPosCount || geometryPosCount < 10) continue;

        let trackProgress =
          (value - trackInfo.startTime) /
          (trackInfo.endTime - trackInfo.startTime);
        let roundedProgress = Math.round(geometryPosCount * trackProgress * 2) / 2; // *2/2 to stick to 0.5 rounding

        //(trackInfo.newLine.geometry as InstancedBufferGeometry). = drawCount;(0, roundedProgress);
        trackInfo.newLine.geometry.instanceCount = roundedProgress;
      }
    }
  }

  public buildEventDataFromJSON(eventData: any) {
    const threeEventProcessor = new ThreeEventProcessor();

    console.time('[buildEventDataFromJSON] BUILD EVENT');

    this.three.sceneEvent.clear();

    // Use the ThreeService to handle object groups
    const eventDataGroup = this.three.sceneEvent;

    // Event data collections by type
    for (const collectionType in eventData) {
      const collectionsOfType = eventData[collectionType];

      for (const collectionName in collectionsOfType) {
        const collection = collectionsOfType[collectionName];

        // // THREE.Group for this collection
        // const collectionGroup = new THREE.Group();
        // collectionGroup.name = collectionName;
        // eventDataGroup.add(collectionGroup);
        //
        // for (const item of collection) {
        //   // Object for each item
        //   const object = threeEventProcessor.makeObject(
        //     collectionType,
        //     collectionName,
        //     item
        //   );
        //
        //   if (object) {
        //     collectionGroup.add(object);
        //   }
        // }
      }
    }

    // Post-processing for specific event data types
    const mcTracksGroup = eventDataGroup.getObjectByName('mc_tracks');
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

    // Update event metadata (not really used for now)
    // this.eventMetadata = {
    //   eventNumber: eventData.eventNumber,
    //   runNumber: eventData.runNumber,
    //   startTime: eventData.startTime * 1000, // Convert UNIX time to milliseconds
    // };

    console.timeEnd('[buildEventDataFromJSON] BUILD EVENT');

    if (this.animateEventAfterLoad) {
      this.animateWithCollision();
    }
  }
  }
