import {Component, Input, OnInit} from '@angular/core';
import {HttpClient, HttpClientModule} from '@angular/common/http';
import {
  EventDataFormat,
  EventDataImportOption,
  EventDisplayService,
  PhoenixUIModule
} from 'phoenix-ui-components';
import {ClippingSetting, Configuration, PhoenixLoader, PhoenixMenuNode, PresetView} from 'phoenix-event-display';
import * as THREE from 'three';
import {Color, DoubleSide, InstancedBufferGeometry, Line, MeshPhongMaterial,} from "three";
import {GeometryService} from '../geometry.service';
import {ActivatedRoute} from '@angular/router';
import {ThreeGeometryProcessor} from "../three-geometry.processor";
import * as TWEEN from '@tweenjs/tween.js';
import GUI from "lil-gui";
import {produceRenderOrder} from "jsrootdi/geom";
import {
  disposeHierarchy,
  disposeNode,
  findObject3DNodes,
  getColorOrDefault,
  pruneEmptyNodes
} from "../utils/three.utils";
import {mergeMeshList, MergeResult} from "../utils/three-geometry-merge";
import {PhoenixThreeFacade} from "../utils/phoenix-three-facade";
import {BehaviorSubject, Subject} from "rxjs";
import {GameControllerService} from "../game-controller.service";
import {LineMaterial} from "three/examples/jsm/lines/LineMaterial";
import {Line2} from "three/examples/jsm/lines/Line2";
import {LineGeometry} from "three/examples/jsm/lines/LineGeometry";
import {IoOptionsComponent} from "./io-options/io-options.component";
import {ProcessTrackInfo, ThreeEventProcessor} from "../three-event.processor";
import {UserConfigService} from "../user-config.service";
import {EicAnimationsManager} from "../eic-animation-manager";
import {MatSlider, MatSliderThumb} from "@angular/material/slider";
import {MatIcon} from "@angular/material/icon";
import {MatButton} from "@angular/material/button";
import {DecimalPipe} from "@angular/common";
import {MatTooltip} from "@angular/material/tooltip";

// import { LineMaterial } from 'three/addons/lines/LineMaterial.js';


@Component({
  selector: 'app-test-experiment',
  templateUrl: './main-display.component.html',
  imports: [PhoenixUIModule, IoOptionsComponent, MatSlider, MatIcon, MatButton, MatSliderThumb, DecimalPipe, MatTooltip],
  standalone: true,
  styleUrls: ['./main-display.component.scss']
})
export class MainDisplayComponent implements OnInit {

  @Input()
  eventDataImportOptions: EventDataImportOption[] = Object.values(EventDataFormat);

  currentTime = 0;
  maxTime = 200;
  minTime = 0;
  message = "";

  /** The root Phoenix menu node. */
  phoenixMenuRoot = new PhoenixMenuNode("Phoenix Menu");

  threeGeometryProcessor = new ThreeGeometryProcessor();
  threeEventProcessor = new ThreeEventProcessor();

  /** is geometry loaded */
  loaded: boolean = false;

  /** loading progress */
  loadingProgress: number = 0;

  /** The Default color of elements if not set */
  defaultColor: Color = new Color(0x2fd691);


  private renderer: THREE.Renderer|null = null;
  private camera: THREE.Camera|null = null;
  private scene: THREE.Scene|null = null;
  private stats: any|null = null;         // Stats JS display from UI manager

  private threeFacade: PhoenixThreeFacade;
  private trackInfos: ProcessTrackInfo[] | null = null;
  private tween: TWEEN.Tween<any> | null = null;





  constructor(
    private geomService: GeometryService,
    private eventDisplay: EventDisplayService,
    private controller: GameControllerService,
    private route: ActivatedRoute,
    private settings: UserConfigService) {
    this.threeFacade = new PhoenixThreeFacade(this.eventDisplay);
  }

  async loadGeometry(initiallyVisible=true, scale=10) {


    let {rootGeometry, threeGeometry} = await this.geomService.loadGeometry();
    if(!threeGeometry) return;


    let threeManager = this.eventDisplay.getThreeManager();
    let uiManager = this.eventDisplay.getUIManager();
    let openThreeManager: any = threeManager;
    let importManager = openThreeManager.importManager;
    const doubleSided = true;

    const sceneGeometry = threeManager.getSceneManager().getGeometries();

    // Set geometry scale
    if (scale) {
      threeGeometry.scale.setScalar(scale);
    }

    // Add root geometry to scene
    // console.log("CERN ROOT converted to Object3d: ", rootObject3d);
    sceneGeometry.add(threeGeometry);



    // Now we want to change the materials
    sceneGeometry.traverse( (child: any) => {

        if(child.type!=="Mesh" || !child?.material?.isMaterial) {
          return;
        }

        // Assuming `getObjectSize` is correctly typed and available
        child.userData["size"] = importManager.getObjectSize(child);

        // Handle the material of the child

        const color = getColorOrDefault(child.material, this.defaultColor);
        const side = doubleSided ? DoubleSide : child.material.side;

        child.material.dispose(); // Dispose the old material if it's a heavy object

        let opacity = threeGeometry.userData["opacity"] ?? 1;
        let transparent = opacity < 1;

        child.material = new MeshPhongMaterial({
          color: color,
          shininess: 0,
          side: side,
          transparent: true,
          opacity: 0.5,
          depthTest: true,
          depthWrite: true,
          clippingPlanes: openThreeManager.clipPlanes,
          clipIntersection: true,
          clipShadows: false
        });

        // Material
        let name:string = child.name;

        if(! child.material?.clippingPlanes !== undefined) {
          child.material.clippingPlanes = openThreeManager.clipPlanes;
        }

        if(! child.material?.clipIntersection !== undefined) {
          child.material.clipIntersection = true;
        }

        if(! child.material?.clipShadows !== undefined) {
          child.material.clipShadows = false;
        }
    });

    // HERE WE DO POSTPROCESSING STEP
    this.threeGeometryProcessor.process(this.geomService.subdetectors);

    // Now we want to change the materials
    sceneGeometry.traverse( (child: any) => {

      if(!child?.material?.isMaterial) {
        return;
      }

      if(child.material?.clippingPlanes !== undefined) {
        child.material.clippingPlanes = openThreeManager.clipPlanes;
      }

      if(child.material?.clipIntersection !== undefined) {
        child.material.clipIntersection = true;
      }

      if(child.material?.clipShadows !== undefined) {
        child.material.clipShadows = false;
      }
    });
    let renderer  = openThreeManager.rendererManager;
    // Set render priority
    let scene = threeManager.getSceneManager().getScene();
    scene.background = new THREE.Color( 0x3F3F3F );
    renderer.getMainRenderer().sortObjects = false;

    let camera = openThreeManager.controlsManager.getMainCamera();
    // camera.far = 5000;
    produceRenderOrder(scene, camera.position, 'ray');

    var planeA = new THREE.Plane();

    planeA.set(new THREE.Vector3(0,-1,0), 0);


    // renderer.getMainRenderer().clippingPlanes = [planeA];
  }

  produceRenderOrder() {

    console.log("produceRenderOrder. scene: ", this.scene, " camera ", this.camera);
    produceRenderOrder(this.scene, this.camera?.position, 'ray');
  }

  logGamepadStates () {
    const gamepads = navigator.getGamepads();

    for (const gamepad of gamepads) {
      if (gamepad) {
        console.log(`Gamepad connected at index ${gamepad.index}: ${gamepad.id}.`);
        console.log(`Timestamp: ${gamepad.timestamp}`);
        console.log('Axes states:');
        gamepad.axes.forEach((axis, index) => {
          console.log(`Axis ${index}: ${axis.toFixed(4)}`);
        });
        console.log('Button states:');
        gamepad.buttons.forEach((button, index) => {
          console.log(`Button ${index}: ${button.pressed ? 'pressed' : 'released'}, value: ${button.value}`);
        });
      }
    }
  };

  rotateCamera(xAxisChange: number, yAxisChange: number) {
    let orbitControls = this.threeFacade.activeOrbitControls;
    let camera = this.threeFacade.mainCamera;

    const offset = new THREE.Vector3(); // Offset of the camera from the target
    const quat = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0));
    const quatInverse = quat.clone().invert();

    const currentPosition = camera.position.clone().sub(orbitControls.target);
    currentPosition.applyQuaternion(quat); // Apply the quaternion

    // Spherical coordinates
    const spherical = new THREE.Spherical().setFromVector3(currentPosition);

    // Adjusting spherical coordinates
    spherical.theta -= xAxisChange * 0.01; // Azimuth angle change
    spherical.phi += yAxisChange * 0.01; // Polar angle change, for rotating up/down

    // Ensure phi is within bounds to avoid flipping
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

    // Convert back to Cartesian coordinates
    const newPostion = new THREE.Vector3().setFromSpherical(spherical);
    newPostion.applyQuaternion(quatInverse);

    camera.position.copy(newPostion.add(orbitControls.target));
    camera.lookAt(orbitControls.target);
    orbitControls.update();
  }

  zoom(factor: number) {
    let orbitControls = this.threeFacade.activeOrbitControls;
    let camera = this.threeFacade.mainCamera;
    orbitControls.object.position.subVectors(camera.position, orbitControls.target).multiplyScalar(factor).add(orbitControls.target);
    orbitControls.update();
  }

  handleGamepadInputV2 () {
    this.controller.animationLoopHandler();
  }

  logCamera() {
    console.log(this.threeFacade.mainCamera);
  }


  handleGamepadInputV1 () {

    // Update stats display that showing FPS, etc.
    if (this.stats) {
      this.stats.update();
    }

    const gamepads = navigator.getGamepads();
    for (const gamepad of gamepads) {
      if (gamepad) {
        // Example: Using left joystick to control OrbitControls
        // Axis 0: Left joystick horizontal (left/right)
        // Axis 1: Left joystick vertical (up/down)
        const xAxis = gamepad.axes[0];
        const yAxis = gamepad.axes[1];

        let controls = this.threeFacade.activeOrbitControls;
        let camera = this.threeFacade.mainCamera;

        if (Math.abs(xAxis) > 0.1 || Math.abs(yAxis) > 0.1) {
          this.rotateCamera(xAxis, yAxis);

        }

        // Zooming using buttons
        const zoomInButton = gamepad.buttons[2];
        const zoomOutButton = gamepad.buttons[0];

        if (zoomInButton.pressed) {
          this.zoom(0.99);
        }

        if (zoomOutButton.pressed) {
          this.zoom(1.01);
        }

        break; // Only use the first connected gamepad
      }
    }
  };

  updateProjectionMatrix() {
    let camera = this.threeFacade.mainCamera;
    camera.updateProjectionMatrix();
  }


  ngOnInit() {


    let eventSource = this.settings.eventSource.value;
    let eventConfig = {eventFile: "https://firebird-eic.org/py8_all_dis-cc_beam-5x41_minq2-100_nevt-5.evt.json.zip", eventType: "zip"};
    if( eventSource != "no-events" && !eventSource.endsWith("edm4hep.json")) {
      let eventType = eventSource.endsWith("zip") ? "zip" : "json";
      let eventFile = eventSource;
      eventConfig = {eventFile, eventType};
    }

    // Create the event display configuration
    const configuration: Configuration = {
      eventDataLoader: new PhoenixLoader(),
      presetViews: [
        // simple preset views, looking at point 0,0,0 and with no clipping
        new PresetView('Left View', [0, 0, -12000], [0, 0, 0], 'left-cube'),
        new PresetView('Center View', [-500, 12000, 0], [0, 0, 0], 'top-cube'),
        new PresetView('Perspective + clip', [-8000, 8000, -3000], [0, 0, 0], 'top-cube', ClippingSetting.On, 45, 120),
        // more fancy view, looking at point 0,0,5000 and with some clipping
        new PresetView('Perspective2 + clip', [-4500, 8000, -6000], [0, 0, -5000], 'right-cube', ClippingSetting.On, 90, 90)
      ],
      // default view with x, y, z of the camera and then x, y, z of the point it looks at
      defaultView: [-2500, 0, -8000, 0, 0 ,0],

      phoenixMenuRoot: this.phoenixMenuRoot,
      // Event data to load by default
      defaultEventFile: eventConfig
      // defaultEventFile: {
      //   // (Assuming the file exists in the `src/assets` directory of the app)
      //   //eventFile: 'assets/herwig_18x275_5evt.json',
      //   //eventFile: 'assets/events/py8_all_dis-cc_beam-18x275_minq2-1000_nevt-20.evt.json',
      //   //eventFile: 'assets/events/py8_dis-cc_mixed.json.zip',
      //   eventFile: 'https://firebird-eic.org/py8_all_dis-cc_beam-5x41_minq2-100_nevt-5.evt.json.zip',
      //   eventType: 'zip'   // or zip
      // },
    }

    // Initialize the event display
    this.eventDisplay.init(configuration);



    // let uiManager = this.eventDisplay.getUIManager();
    let openThreeManager: any = this.eventDisplay.getThreeManager();
    let threeManager = this.eventDisplay.getThreeManager();

    // Replace animation manager with EIC animation manager:

    // Animations manager (!) DANGER ZONE (!) But we have to, right?
    // Deadline approaches and meteor will erase the humanity if we are not in time...
    openThreeManager.animationsManager = new EicAnimationsManager(
      openThreeManager.sceneManager.getScene(),
      openThreeManager.controlsManager.getActiveCamera(),
      openThreeManager.rendererManager,
    );

    this.renderer  = openThreeManager.rendererManager.getMainRenderer();
    this.scene = threeManager.getSceneManager().getScene() as THREE.Scene;
    this.camera = openThreeManager.controlsManager.getMainCamera() as THREE.Camera;


    // GUI
    const globalPlane = new THREE.Plane( new THREE.Vector3( - 1, 0, 0 ), 0.1 );

    const gui = new GUI({
      // container: document.getElementById("lil-gui-place") ?? undefined,

    });

    gui.title("Debug");
    gui.add(this, "produceRenderOrder");
    gui.add(this, "logGamepadStates").name( 'Log controls' );
    gui.add(this, "logCamera").name( 'Log camera' );
    gui.add(this, "updateProjectionMatrix").name( 'Try to screw up the camera =)' );
    gui.close();

    // Set default clipping
    this.eventDisplay.getUIManager().setClipping(true);
    this.eventDisplay.getUIManager().rotateOpeningAngleClipping(180);
    this.eventDisplay.getUIManager().rotateStartAngleClipping(90);

    this.eventDisplay.listenToDisplayedEventChange(event => {
      console.log("listenToDisplayedEventChange");
      console.log(event);
      this.trackInfos = null;
      let mcTracksGroup = threeManager.getSceneManager().getObjectByName("mc_tracks");
      if(mcTracksGroup) {
        this.trackInfos = this.threeEventProcessor.processMcTracks(mcTracksGroup);
        let minTime = Infinity;
        let maxTime = 0;
        for(let trackInfo of this.trackInfos) {
          if(trackInfo.startTime < minTime) minTime = trackInfo.startTime;
          if(trackInfo.endTime > maxTime) maxTime = trackInfo.endTime;
        }

        this.maxTime = maxTime;
        this.minTime = minTime;

        this.message = `Time ${minTime}:${maxTime} [ns], Tracks: ${this.trackInfos.length}`;
      }
    })
    // Display event loader
    this.eventDisplay.getLoadingManager().addLoadListenerWithCheck(() => {
      console.log('Loading default configuration.');
      this.loaded = true;
    });

    this.eventDisplay
      .getLoadingManager().toLoad.push("MyGeometry");


    this.eventDisplay
      .getLoadingManager()
      .addProgressListener((progress) => (this.loadingProgress = progress));

    this.stats = (this.eventDisplay.getUIManager() as any).stats;


    threeManager.setAnimationLoop(()=>{this.handleGamepadInputV1()});



    //const events_url = "https://eic.github.io/epic/artifacts/sim_dis_10x100_minQ2=1000_epic_craterlake.edm4hep.root/sim_dis_10x100_minQ2=1000_epic_craterlake.edm4hep.root"
    //const events_url = "https://eic.github.io/epic/artifacts/sim_dis_10x100_minQ2=1000_epic_craterlake.edm4hep.root"
    // const events_url = "assets/events/sim_dis_10x100_minQ2=1000_epic_craterlake.edm4hep.root"
    // let loader = new Edm4hepRootEventLoader();
    // loader.openFile(events_url).then(value => {
    //     console.log('Opened root file');
    //   }
    // );

    const geometryAddress = this.route.snapshot.queryParams['geo'];
    console.log(`geometry query: ${geometryAddress}`);

    let jsonGeometry;
    this.loadGeometry().then(jsonGeom => {
      jsonGeometry = jsonGeom;
      this.eventDisplay
        .getLoadingManager().itemLoaded("MyGeometry");
    }).catch(reason=> {
      console.error("ERROR LOADING GEOMETRY");
      console.log(reason);
    });



    document.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        // do something..
      }
      if ((e as KeyboardEvent).key === 'q') {
        const name = `event_5x41_${Math.floor(Math.random() * 20)}`
        console.log(name); // This will log a random index from 0 to 3
        this.eventDisplay.loadEvent(name);
        this.eventDisplay.animateEventWithCollision(1500);
      }
      console.log((e as KeyboardEvent).key);
    });
  }

  changeCurrentTime(event: Event) {
    if(!event) return;
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    this.currentTime = value;

    this.processCurrentTimeChange();

    //this.updateParticlePosition(value);
  }

  timeStep($event: MouseEvent) {
    if(this.currentTime < this.maxTime) this.currentTime++;
    if(this.currentTime > this.maxTime) this.currentTime = this.maxTime;
    this.processCurrentTimeChange();
  }

  public formatCurrentTime (value: number): string {
    return value.toFixed(1);
  }

  private processCurrentTimeChange() {
    let partialTracks: ProcessTrackInfo[] = [];
    if(this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        if(trackInfo.startTime > this.currentTime) {
          trackInfo.trackNode.visible = false;
        }
        else
        {
          trackInfo.trackNode.visible = true;
          trackInfo.newLine.geometry.instanceCount=trackInfo.positions.length;

          if(trackInfo.endTime > this.currentTime) {
            partialTracks.push(trackInfo)
          }
          else {
            // track should be visible fully
            trackInfo.newLine.geometry.instanceCount=Infinity;
          }
        }
      }
    }


    if(partialTracks.length > 0) {
      for(let trackInfo of partialTracks) {
        let geometryPosCount = trackInfo.positions.length;

        //if (!geometryPosCount || geometryPosCount < 10) continue;

        let trackProgress = (this.currentTime - trackInfo.startTime)/(trackInfo.endTime-trackInfo.startTime);
        let roundedProgress = Math.round(geometryPosCount*trackProgress*2)/2;      // *2/2 to stick to 0.5 rounding

        //(trackInfo.newLine.geometry as InstancedBufferGeometry). = drawCount;(0, roundedProgress);
        trackInfo.newLine.geometry.instanceCount=roundedProgress;
      }
    }
  }

  animateCurrentTime(targetTime: number, duration: number): void {
    if(this.tween) {
      this.stopAnimation();
    }
    this.tween = new TWEEN.Tween({ currentTime: this.currentTime })
      .to({ currentTime: targetTime }, duration)
      .onUpdate((obj) => {
        this.currentTime = obj.currentTime;
        this.processCurrentTimeChange(); // Assuming this method updates your display
      })
      .easing(TWEEN.Easing.Quadratic.Out) // This can be changed to other easing functions
      .start();

    //this.animate();
  }


  animateTime() {
    this.animateCurrentTime(this.maxTime, (this.maxTime-this.currentTime)*200 )

  }

  stopAnimation(): void {
    if (this.tween) {
      this.tween.stop(); // Stops the tween if it is running
      this.tween = null; // Remove reference
    }
  }

  exitTimedDisplay() {
    this.stopAnimation();
    if(this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = true;
        trackInfo.newLine.geometry.instanceCount=Infinity;
      }
    }
  }

  rewindTime() {
    this.currentTime = 0;
  }
}
