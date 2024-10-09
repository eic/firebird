import {AfterViewInit, Component, ElementRef, Input, OnInit, Renderer2, ViewChild} from '@angular/core';
import {HttpClient, HttpClientModule} from '@angular/common/http';

import {
  EventDataFormat,
  EventDataImportOption,
  EventDisplayService,
  PhoenixUIModule
} from 'phoenix-ui-components';
import {ClippingSetting, Configuration, PhoenixLoader, PhoenixMenuNode, PresetView} from 'phoenix-event-display';
import * as THREE from 'three';
import {Color, DoubleSide, InstancedBufferGeometry, Line, MeshLambertMaterial, MeshPhongMaterial,} from "three";
import {ALL_GROUPS, GeometryService} from '../../services/geometry.service';
import {ActivatedRoute} from '@angular/router';
import {ThreeGeometryProcessor} from "../../data-pipelines/three-geometry.processor";
import * as TWEEN from '@tweenjs/tween.js';
import GUI from "lil-gui";
import {produceRenderOrder} from "jsrootdi/geom";
import {
  disposeHierarchy,
  disposeNode,
  findObject3DNodes,
  getColorOrDefault,
  pruneEmptyNodes
} from "../../utils/three.utils";
import {PhoenixThreeFacade} from "../../utils/phoenix-three-facade";
import {BehaviorSubject, Subject} from "rxjs";
import {GameControllerService} from "../../services/game-controller.service";
import {LineMaterial} from "three/examples/jsm/lines/LineMaterial";
import {Line2} from "three/examples/jsm/lines/Line2";
import {LineGeometry} from "three/examples/jsm/lines/LineGeometry";
import {IoOptionsComponent} from "../../components/io-options/io-options.component";
import {ProcessTrackInfo, ThreeEventProcessor} from "../../data-pipelines/three-event.processor";
import {UserConfigService} from "../../services/user-config.service";
import {EicAnimationsManager} from "../../phoenix-overload/eic-animation-manager";
import {MatSlider, MatSliderThumb} from "@angular/material/slider";
import {MatIcon} from "@angular/material/icon";
import {MatButton, MatIconButton} from "@angular/material/button";
import {DecimalPipe, NgClass, NgForOf} from "@angular/common";
import {MatTooltip} from "@angular/material/tooltip";
import {MatSnackBar} from "@angular/material/snack-bar"
import {MatFormField} from "@angular/material/form-field";
import {MatOption, MatSelect} from "@angular/material/select";
import {GeometryTreeWindowComponent} from "../geometry-tree/geometry-tree-window/geometry-tree-window.component";
import {DataModelService} from "../../services/data-model.service";
import {AngularSplitModule} from "angular-split";
import {GeometryTreeComponent} from "../geometry-tree/geometry-tree.component";
import {DisplayShellComponent} from "../../components/display-shell/display-shell.component";
import {DataModelPainter} from "../../painters/data-model-painter";


// import { LineMaterial } from 'three/addons/lines/LineMaterial.js';


@Component({
  selector: 'app-test-experiment',
  templateUrl: './main-display.component.html',
  imports: [PhoenixUIModule, IoOptionsComponent, MatSlider, MatIcon, MatButton, MatSliderThumb, DecimalPipe, MatTooltip, MatFormField, MatSelect, MatOption, NgForOf, GeometryTreeWindowComponent, AngularSplitModule, GeometryTreeComponent, NgClass, MatIconButton, DisplayShellComponent],
  standalone: true,
  styleUrls: ['./main-display.component.scss']
})
export class MainDisplayComponent implements OnInit, AfterViewInit {

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

  private geometryGroupSwitchingIndex = ALL_GROUPS.length;


  private renderer: THREE.Renderer|null = null;
  private camera: THREE.Camera|null = null;
  private scene: THREE.Scene|null = null;
  private stats: any|null = null;         // Stats JS display from UI manager

  private threeFacade: PhoenixThreeFacade;
  private trackInfos: ProcessTrackInfo[] | null = null;
  private tween: TWEEN.Tween<any> | null = null;
  private animationManager: EicAnimationsManager| null = null;
  currentGeometry: string = "All";
  private animateEventAfterLoad: boolean = false;
  protected eventsByName = new Map<string, any>();
  private eventsArray: any[] = [];
  selectedEventKey: string|undefined;
  private beamAnimationTime: number = 1000;

  private isHandlerDragging = false;
  isLeftPaneOpen: boolean = true;

  private painter: DataModelPainter = new DataModelPainter();


  constructor(
    private geomService: GeometryService,
    private eventDisplay: EventDisplayService,
    private controller: GameControllerService,
    private route: ActivatedRoute,
    private settings: UserConfigService,
    private dataService: DataModelService,
    private elRef: ElementRef, private renderer2: Renderer2,
    private _snackBar: MatSnackBar) {
    this.threeFacade = new PhoenixThreeFacade(this.eventDisplay);

  }




  @ViewChild(DisplayShellComponent)
  displayShellComponent!: DisplayShellComponent;

  @ViewChild(GeometryTreeComponent)
  geometryTreeComponent: GeometryTreeComponent|null|undefined;

  toggleLeftPane() {
    this.displayShellComponent.toggleLeftPane();
    this.isLeftPaneOpen = !this.isLeftPaneOpen;
  }

  toggleRightPane() {
    this.displayShellComponent.toggleRightPane();
  }


  logRendererInfo() {
    let renderer = this.threeFacade.mainRenderer;
    console.log('Draw calls:', renderer.info.render.calls);
    console.log('Triangles:', renderer.info.render.triangles);
    console.log('Points:', renderer.info.render.points);
    console.log('Lines:', renderer.info.render.lines);
    console.log('Geometries in memory:', renderer.info.memory.geometries);
    console.log('Textures in memory:', renderer.info.memory.textures);
    console.log('Programs:', renderer.info?.programs?.length);
    console.log(renderer.info?.programs);
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

        // child.material = new MeshPhongMaterial({
        //   color: color,
        //   shininess: 0,
        //   side: side,
        //   transparent: true,
        //   opacity: 0.7,
        //   blending: THREE.NormalBlending,
        //   depthTest: true,
        //   depthWrite: true,
        //   clippingPlanes: openThreeManager.clipPlanes,
        //   clipIntersection: true,
        //   clipShadows: false
        // });

        child.material = new MeshLambertMaterial({
          color: color,
          side: side,
          transparent: true,
          opacity: 0.7,
          blending: THREE.NormalBlending,
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
    spherical.theta -= xAxisChange * 0.023; // Azimuth angle change
    spherical.phi += yAxisChange * 0.023; // Polar angle change, for rotating up/down

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

    this.controller.animationLoopHandler();

    const gamepads = navigator.getGamepads();
    for (const gamepad of gamepads) {
      if (gamepad) {
        // Example: Using left joystick to control OrbitControls
        // Axis 0: Left joystick horizontal (left/right)
        // Axis 1: Left joystick vertical (up/down)
        const xAxis = gamepad.axes[0];
        const yAxis = gamepad.axes[1];

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

  /**
   * Receives an object containing one event and builds the different collections
   * of physics objects.
   * @param eventData Object containing the event data.
   */
  public buildEventDataFromJSON(eventData: any) {

    console.time("[buildEventDataFromJSON] BUILD EVENT");
    let openEventDisplay = (this.eventDisplay as any);

    // Reset labels
    openEventDisplay.resetLabels();
    // Creating UI folder
    openEventDisplay.ui.addEventDataFolder();
    openEventDisplay.ui.addLabelsFolder();
    // Clearing existing event data
    openEventDisplay.graphicsLibrary.clearEventData();
    // Build data and add to scene
    openEventDisplay.configuration.eventDataLoader.buildEventData(
      eventData,
      openEventDisplay.graphicsLibrary,
      openEventDisplay.ui,
      openEventDisplay.infoLogger,
    );
    console.timeEnd("[buildEventDataFromJSON] BUILD EVENT");
    console.time("[buildEventDataFromJSON] onDisplayedEventChange");
    openEventDisplay.onDisplayedEventChange.forEach((callback:any) => {
      return callback(eventData);
    });
    console.timeEnd("[buildEventDataFromJSON] onDisplayedEventChange");


    // Reload the event data state in Phoenix menu
    // openEventDisplay.ui.loadEventFolderPhoenixMenuState();
  }




  ngOnInit() {
    let eventSource = this.settings.trajectoryEventSource.value;
    let eventConfig = {eventFile: "https://firebird-eic.org/py8_all_dis-cc_beam-5x41_minq2-100_nevt-5.evt.json.zip", eventType: "zip"};
    if( eventSource != "no-events" && !eventSource.endsWith("edm4hep.json")) {
      let eventType = eventSource.endsWith("zip") ? "zip" : "json";
      let eventFile = eventSource;
      eventConfig = {eventFile, eventType};
    }

    if (typeof Worker !== 'undefined') {
      // Create a new
      const worker = new Worker(new URL('../../workers/event-loader.worker.ts', import.meta.url));
      worker.onmessage = ({ data }) => {
        console.log(`Result from worker: ${data}`);
        console.log(data);

        for(let key in data) {
          this.eventsByName.set(key, data[key]);
          this.eventsArray.push(data[key]);
        }
        //this.buildEventDataFromJSON(this.eventsArray[0]);
        this.eventDisplay.parsePhoenixEvents(data);
        console.log(this);
        console.log(`Loading event: `);
        console.log(data);
      };
      worker.postMessage(eventConfig.eventFile);
    } else {
      // Web workers are not supported in this environment.
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
      // defaultEventFile: eventConfig
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


    this.controller.buttonB.onPress.subscribe(value => {
      this.onControllerBPressed(value);
    });

    this.controller.buttonRT.onPress.subscribe(value => {
      this.onControllerRTPressed(value);
    });

    this.controller.buttonLT.onPress.subscribe(value => {
      this.onControllerLTPressed(value);
    });

    this.controller.buttonY.onPress.subscribe(value => {
      this.onControllerYPressed(value);
    });

    // let uiManager = this.eventDisplay.getUIManager();
    let openThreeManager: any = this.eventDisplay.getThreeManager();
    let threeManager = this.eventDisplay.getThreeManager();

    // Replace animation manager with EIC animation manager:

    // Animations manager (!) DANGER ZONE (!) But we have to, right?
    // Deadline approaches and meteor will erase the humanity if we are not in time...
    openThreeManager.animationsManager = this.animationManager = new EicAnimationsManager(
      openThreeManager.sceneManager.getScene(),
      openThreeManager.controlsManager.getActiveCamera(),
      openThreeManager.rendererManager,
    );


    this.renderer  = openThreeManager.rendererManager.getMainRenderer();
    this.scene = threeManager.getSceneManager().getScene() as THREE.Scene;
    this.camera = openThreeManager.controlsManager.getMainCamera() as THREE.Camera;


    // // GUI
    // const globalPlane = new THREE.Plane( new THREE.Vector3( - 1, 0, 0 ), 0.1 );
    //
    // const gui = new GUI({
    //   container: document.getElementById("lil-gui-place") ?? undefined,
    // });

    // gui.title("Dev Controls");
    // gui.add(this, "produceRenderOrder");
    // gui.add(this, "logGamepadStates").name( 'Log controls' );
    // gui.add(this, "logCamera").name( 'Log camera' );
    // gui.add(this, "updateProjectionMatrix").name( 'Try to screw up the camera =)' );
    // gui.close();

    // Set default clipping
    this.eventDisplay.getUIManager().setClipping(true);
    this.eventDisplay.getUIManager().rotateOpeningAngleClipping(180);
    this.eventDisplay.getUIManager().rotateStartAngleClipping(90);

    this.eventDisplay.listenToDisplayedEventChange(event => {
      this.updateSceneTreeComponent();
      console.log("listenToDisplayedEventChange");
      console.log(event);
      this.trackInfos = null;

      let mcTracksGroup = threeManager.getSceneManager().getObjectByName("mc_tracks");
      if(mcTracksGroup) {
        console.time("Process tracks on event load");
        this.trackInfos = this.threeEventProcessor.processMcTracks(mcTracksGroup);

        let minTime = Infinity;
        let maxTime = 0;
        for(let trackInfo of this.trackInfos) {
          if(trackInfo.startTime < minTime) minTime = trackInfo.startTime;
          if(trackInfo.endTime > maxTime) maxTime = trackInfo.endTime;
        }

        this.maxTime = maxTime;
        this.minTime = minTime;

        this.message = `Tracks: ${this.trackInfos.length}`;
        if(this.trackInfos && this.animateEventAfterLoad) {
          for (let trackInfo of this.trackInfos) {
            trackInfo.trackNode.visible = false;
          }
        }
        console.timeEnd("Process tracks on event load");

      }
      if(this.animateEventAfterLoad) {
        this.animateWithCollision();
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

      this.updateSceneTreeComponent();

      this.eventDisplay.getLoadingManager().itemLoaded("MyGeometry");
    }).catch(reason=> {
      console.error("ERROR LOADING GEOMETRY");
      console.log(reason);
    });

    this.dataService.loadEdm4EicData().then(data => {
      this.updateSceneTreeComponent();
      console.log("loaded data model");
      console.log(data);
    })

    this.dataService.loadDexData().then(data => {
      this.updateSceneTreeComponent();
      if(data == null) {
        console.warn("DataService.loadDexData() Received data is null or undefined");
        return;
      }

      if(data.entries?.length ?? 0 > 0) {
        this.painter.setEntry(data.entries[0]);
        this.painter.paint(this.currentTime);
      } else {
        console.warn("DataService.loadDexData() Received data had no entries");
        console.log(data);
      }

      //console.log("loaded data model");
      //console.log(data);
    })

    document.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        // do something..
      }
      if ((e as KeyboardEvent).key === 'q') {
        this.nextRandomEvent();
      }
      if ((e as KeyboardEvent).key === 'r') {
        this.logRendererInfo();
      }
      console.log((e as KeyboardEvent).key);

    });
  }


  ngAfterViewInit(): void {
    this.displayShellComponent.onVisibilityChangeLeft.subscribe(()=> {this.onRendererElementResize();})
    this.displayShellComponent.onVisibilityChangeRight.subscribe(()=> {this.onRendererElementResize();})
    this.displayShellComponent.onEndResizeLeft.subscribe(()=> {this.onRendererElementResize();})
    this.displayShellComponent.onEndResizeRight.subscribe(()=> {this.onRendererElementResize();})

    window.addEventListener('resize', () => {
      this.onRendererElementResize();
    });
  }

  private onRendererElementResize() {
    const renderer = this.threeFacade.mainRenderer;
    const camera = this.threeFacade.mainCamera;
    const rendererElement = renderer.domElement;
    if(rendererElement == null) {
      return;
    }

    // This is the element in which Three.js canvas is located
    const outerElement = document.getElementById('eventDisplay');
    if(outerElement == null) {
      return;
    }

    if(this.displayShellComponent == null) {
      return;
    }

    // Calculate adjusted dimensions
    let headerHeight =  0;
    const footerHeight =  0; // TODO?
    const sidePanelWidth = this.displayShellComponent.leftPaneWidth;

    // We use padding to
    let element = document.getElementById('eventDisplay');
    if(element) {
      let computedStyle = window.getComputedStyle(element);
      headerHeight = parseFloat(computedStyle.paddingTop) ?? 0;
    }

    const adjustedWidth = outerElement.offsetWidth;
    const adjustedHeight = outerElement.offsetHeight - headerHeight - footerHeight;
    console.log(`New size: ${adjustedWidth}x${adjustedHeight}`)

    // Update renderer size
    renderer.setSize(adjustedWidth, adjustedHeight);

    if (camera.isOrthographicCamera) {
      camera.left = adjustedWidth / -2;
      camera.right = adjustedWidth / 2;
      camera.top = adjustedHeight / 2;
      camera.bottom = adjustedHeight / -2;
    } else {
      camera.aspect = adjustedWidth / adjustedHeight;
    }
    camera.updateProjectionMatrix();
  }

  private onControllerBPressed(value: boolean) {
    if(value) {
      this.beamAnimationTime = 1800;
      this.nextRandomEvent("5x41");
    }
  }

  private onControllerRTPressed(value: boolean) {

    if(value) {
      this.beamAnimationTime = 1200;
      this.nextRandomEvent("10x100");
    }
  }

  private onControllerLTPressed(value: boolean) {
    if(value) {
      this.beamAnimationTime = 700;
      this.nextRandomEvent("18x275");
    }

  }

  private onControllerYPressed(value: boolean) {
    if(value) this.cycleGeometry();
  }

  changeCurrentTime(event: Event) {
    if(!event) return;
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    this.currentTime = value;

    this.processCurrentTimeChange();

    //this.updateParticlePosition(value);
  }
  timeStepBack($event: MouseEvent) {
    if(this.currentTime > this.minTime) this.currentTime--;
    if(this.currentTime < this.minTime) this.currentTime = this.minTime;
    this.processCurrentTimeChange();
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
    this.painter.paint(this.currentTime);
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
      //.easing(TWEEN.Easing.Quadratic.In) // This can be changed to other easing functions
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
    this.rewindTime();
    this.animateEventAfterLoad = false;
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

  animateWithCollision() {
    this.stopAnimation();
    this.rewindTime();
    if(this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = false;
      }
    }
    this.animationManager?.collideParticles(this.beamAnimationTime, 30, 5000, new Color(0xAAAAAA),
      () => {
        this.animateTime();
    });
  }

  showGeometryGroup(groupName: string) {
    if(!this.geomService.subdetectors) return;
    for(let detector of this.geomService.subdetectors) {
      if(detector.groupName === groupName) {
        detector.geometry.visible = true;
      } else {
        detector.geometry.visible = false;
      }
    }

  }

  showAllGeometries() {
    this.geometryGroupSwitchingIndex = ALL_GROUPS.length
    if(!this.geomService.subdetectors) return;
    for(let detector of this.geomService.subdetectors) {
      detector.geometry.visible = true;
    }
  }

  cycleGeometry() {
    this.geometryGroupSwitchingIndex ++;
    if(this.geometryGroupSwitchingIndex > ALL_GROUPS.length) {
      this.geometryGroupSwitchingIndex = 0;
    }

    if(this.geometryGroupSwitchingIndex === ALL_GROUPS.length) {
      this.showAllGeometries();
      this.currentGeometry = "All";
    } else {
      this.currentGeometry = ALL_GROUPS[this.geometryGroupSwitchingIndex];
      this.showGeometryGroup(this.currentGeometry);
    }
  }

  protected nextRandomEvent(energyStr="18x275") {
    const name = `event_18x275_minq2_100_${Math.floor(Math.random() * 10)}`
    console.log(name); // This will log a random index from 0 to 3

    let eventNames=[];
    for(const eventName of this.eventsByName.keys()) {
      if(eventName.includes(energyStr)) {
        eventNames.push(eventName);
      }
    }

    if(eventNames.length === 0) {
      console.warn(`this.eventsByName that has ${this.eventsByName.size} elements, doesn't have keys with energy: ${energyStr}`);
      console.log(this.eventsByName);
      return;
    }

    let eventIndex = Math.floor(Math.random() * eventNames.length);
    if(eventIndex < 0 || eventIndex >= eventNames.length) {
      console.warn(`if(eventIndex < 0 || eventIndex >= eventNames.length) eventIndex=${eventIndex}`);
    }

    const eventName = eventNames[eventIndex];

    // Handle existing animations
    this.stopAnimation();
    if(this.trackInfos) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = false;
      }   }

    this._snackBar.open(`Showing event: ${eventName}`, 'Dismiss', {
      duration: 2000,  // Duration in milliseconds after which the snack-bar will auto dismiss
      horizontalPosition: 'right',  // 'start' | 'center' | 'end' | 'left' | 'right'
      verticalPosition: 'top',    // 'top' | 'bottom'
    });

    this.animateEventAfterLoad = true;

    this.eventDisplay.loadEvent(eventName);

    if(this.trackInfos && this.animateEventAfterLoad) {
      for (let trackInfo of this.trackInfos) {
        trackInfo.trackNode.visible = false;
      }
    }


    //  this.buildEventDataFromJSON(eventIndex);

  }

  onUserSelectedEvent() {

    let event = this.eventsByName.get(this.selectedEventKey ?? "");
    if(event === undefined) {
      console.warn(`User selected event ${this.selectedEventKey} which is not found in eventsByName collection.
      Collection has ${this.eventsByName.size} elements `);
      return;
    }
    console.log(`User selected event ${this.selectedEventKey} `);
    this.buildEventDataFromJSON(event);
  }

  private updateSceneTreeComponent() {
    // Name scene lights
    if (this.scene) {
      if (this.scene.children.length > 2) {
        if (this.scene.children[0]) {
          this.scene.children[0].name = "Ambient light";
        }
        if (this.scene.children[1]) {
          this.scene.children[1].name = "Direct. light";
        }
      }
    }

    if(this.geometryTreeComponent) {
      this.geometryTreeComponent.refreshScheneTree();
    }

  }
}
