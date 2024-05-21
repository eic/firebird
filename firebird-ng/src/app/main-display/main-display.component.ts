import {Component, OnInit} from '@angular/core';
import {EventDisplayService, PhoenixUIModule} from 'phoenix-ui-components';
import {ClippingSetting, Configuration, PhoenixLoader, PhoenixMenuNode, PresetView} from 'phoenix-event-display';
import * as THREE from 'three';
import {Color, DoubleSide, MeshPhongMaterial,} from "three";
import {GeometryService} from '../geometry.service';
import {ActivatedRoute} from '@angular/router';
import {ThreeGeometryProcessor} from "../three-geometry.processor";

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


@Component({
  selector: 'app-test-experiment',
  templateUrl: './main-display.component.html',
  imports: [PhoenixUIModule],
  standalone: true,
  styleUrls: ['./main-display.component.scss']
})
export class MainDisplayComponent implements OnInit {

  /** The root Phoenix menu node. */
  phoenixMenuRoot = new PhoenixMenuNode("Phoenix Menu");

  threeGeometryProcessor = new ThreeGeometryProcessor();

  /** is geometry loaded */
  loaded: boolean = false;

  /** loading progress */
  loadingProgress: number = 0;

  /** The Default color of elements if not set */
  defaultColor: Color = new Color(0x2fd691);
  private renderer: THREE.Renderer|null = null;
  private camera: THREE.Camera|null = null;
  private scene: THREE.Scene|null = null;

  private threeFacade: PhoenixThreeFacade;

  constructor(
    private geomService: GeometryService,
    private eventDisplay: EventDisplayService,
    private route: ActivatedRoute) {
    this.threeFacade = new PhoenixThreeFacade(this.eventDisplay);
  }

  async loadGeometry(initiallyVisible=true, scale=10) {

    let {rootGeoManager, rootObject3d} = await this.geomService.loadGeometry();
    let threeManager = this.eventDisplay.getThreeManager();
    let uiManager = this.eventDisplay.getUIManager();
    let openThreeManager: any = threeManager;
    let importManager = openThreeManager.importManager;
    const doubleSided = true;

    const sceneGeometry = threeManager.getSceneManager().getGeometries();

    // Set geometry scale
    if (scale) {
      rootObject3d.scale.setScalar(scale);
    }

    // Add root geometry to scene
    // console.log("CERN ROOT converted to Object3d: ", rootObject3d);
    sceneGeometry.add(rootObject3d);



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

        let opacity = rootObject3d.userData.opacity ?? 1;
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
    this.threeGeometryProcessor.process(rootObject3d);

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
    camera.far = 5000;
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

  handleGamepadInput () {
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
          const offset = new THREE.Vector3(); // Offset of the camera from the target
          const quat = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0));
          const quatInverse = quat.clone().invert();

          const currentPosition = camera.position.clone().sub(controls.target);
          currentPosition.applyQuaternion(quat); // Apply the quaternion

          // Spherical coordinates
          const spherical = new THREE.Spherical().setFromVector3(currentPosition);

          // Adjusting spherical coordinates
          spherical.theta -= xAxis * 0.01; // Azimuth angle change
          spherical.phi += yAxis * 0.01; // Polar angle change, for rotating up/down

          // Ensure phi is within bounds to avoid flipping
          spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

          // Convert back to Cartesian coordinates
          const newPostion = new THREE.Vector3().setFromSpherical(spherical);
          newPostion.applyQuaternion(quatInverse);

          camera.position.copy(newPostion.add(controls.target));
          camera.lookAt(controls.target);
          controls.update();
        }

        // // Assume button indices 4 and 5 are the shoulder buttons
        // const zoomInButton = gamepad.buttons[0];
        // const zoomOutButton = gamepad.buttons[2];
        //
        // if (zoomInButton.pressed) {
        //   camera.zoom *= 1.05;
        //   console.log(camera);
        //   // Updating camera clipping planes dynamically
        //   //camera.near = 0.1;   // Be cautious with making this too small, which can cause z-fighting
        //   //camera.far = 100000;  // Large value to ensure distant objects are rendered
        //
        //   camera.updateProjectionMatrix();
        // }
        //
        // if (zoomOutButton.pressed) {
        //   camera.zoom /= 1.05;
        //   // Updating camera clipping planes dynamically
        //   //camera.near = 0.1;   // Be cautious with making this too small, which can cause z-fighting
        //   //camera.far = 100000;  // Large value to ensure distant objects are rendered
        //   camera.updateProjectionMatrix();
        //   console.log(camera);
        // }
        //
        // // Optionally: Map other axes/buttons to other camera controls like zoom or pan
        // if (gamepad.axes.length > 2) {
        //   // Additional axes for more control, e.g., zoom with third axis
        //   const zoomAxis = gamepad.axes[2]; // Typically the right stick vertical
        //   camera.position.z += zoomAxis * 0.1; // Adjust zoom sensitivity
        // }

        // Zooming using buttons
        const zoomInButton = gamepad.buttons[2];
        const zoomOutButton = gamepad.buttons[0];

        if (zoomInButton.pressed) {
          controls.object.position.subVectors(camera.position, controls.target).multiplyScalar(0.99).add(controls.target);
          controls.update();
        }

        if (zoomOutButton.pressed) {
          controls.object.position.subVectors(camera.position, controls.target).multiplyScalar(1.01).add(controls.target);
          controls.update();
        }

        // Zooming using the third axis of the gamepad
        const zoomAxis = gamepad.axes[2]; // Typically the right stick vertical
        if (Math.abs(zoomAxis) > 0.1) {
          let zoomFactor = zoomAxis < 0 ? 0.95 : 1.05;
          controls.object.position.subVectors(camera.position, controls.target).multiplyScalar(zoomFactor).add(controls.target);
          controls.update();
        }

        break; // Only use the first connected gamepad

        //
        //
        // if (Math.abs(xAxis) > 0.1 || Math.abs(yAxis) > 0.1) {
        //   // Get the current radius and angles in spherical coordinates relative to the target
        //   const radius = controls.target.distanceTo(camera.position);
        //   const phi = Math.atan2(
        //     Math.sqrt((camera.position.x - controls.target.x) ** 2 + (camera.position.z - controls.target.z) ** 2),
        //     (camera.position.y - controls.target.y)
        //   );
        //   const theta = Math.atan2(camera.position.z - controls.target.z, camera.position.x - controls.target.x);
        //
        //   // Adjust theta (azimuthal angle) based on the x-axis of the joystick
        //   const newTheta = theta - xAxis * 0.1;
        //
        //   // Adjust phi (polar angle) based on the y-axis of the joystick
        //   const newPhi = phi - yAxis * 0.1;
        //
        //   // Ensure the phi is clamped to prevent the camera from flipping over
        //   const clampedPhi = Math.max(0.1, Math.min(Math.PI - 0.1, newPhi));
        //
        //   // Convert updated spherical coordinates back to Cartesian coordinates
        //   camera.position.x = controls.target.x + radius * Math.sin(clampedPhi) * Math.cos(newTheta);
        //   camera.position.y = controls.target.y + radius * Math.cos(clampedPhi);
        //   camera.position.z = controls.target.z + radius * Math.sin(clampedPhi) * Math.sin(newTheta);
        //
        //   camera.lookAt(controls.target);
        //   controls.update();
        // }


        //
        // //console.log(`Using gamepad at index ${gamepad.index}: ${gamepad.id}`);
        // gamepad.axes.forEach((axis, index) => {
        //   if (axis !== 0) {
        //     console.log(`Axis ${index}: ${axis.toFixed(4)}`);
        //   }
        // });
        // gamepad.buttons.forEach((button, index) => {
        //   if (button.pressed) {
        //     console.log(`Button ${index} is pressed with value ${button.value}`);
        //   }
        // });
        // // Stop after processing the first connected gamepad
        // break;
      }
    }
  };


  ngOnInit() {

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
      defaultEventFile: {
        // (Assuming the file exists in the `src/assets` directory of the app)
        //eventFile: 'assets/herwig_18x275_5evt.json',
        eventFile: 'assets/events/herwig_5x41_5evt_showers.json',
        eventType: 'json'   // or zip
      },
    }

    // Initialize the event display
    this.eventDisplay.init(configuration);

    // let uiManager = this.eventDisplay.getUIManager();
    let openThreeManager: any = this.eventDisplay.getThreeManager();
    let threeManager = this.eventDisplay.getThreeManager();

    this.renderer  = openThreeManager.rendererManager.getMainRenderer();
    this.scene = threeManager.getSceneManager().getScene() as THREE.Scene;
    this.camera = openThreeManager.controlsManager.getMainCamera() as THREE.Camera;


    // GUI
    const globalPlane = new THREE.Plane( new THREE.Vector3( - 1, 0, 0 ), 0.1 );

    const gui = new GUI({
      container: document.getElementById("lil-gui-place") ?? undefined,

    });
    gui.title("Debug");
    gui.add(this, "produceRenderOrder");
    gui.add(this, "logGamepadStates").name( 'Log controls' );

    // Set default clipping
    this.eventDisplay.getUIManager().setClipping(true);
    this.eventDisplay.getUIManager().rotateOpeningAngleClipping(180);
    this.eventDisplay.getUIManager().rotateStartAngleClipping(90);

    // Display event loader
    this.eventDisplay.getLoadingManager().addLoadListenerWithCheck(() => {
      console.log('Loading default configuration.');
      this.loaded = true;
    });

    this.eventDisplay
      .getLoadingManager()
      .addProgressListener((progress) => (this.loadingProgress = progress));



    threeManager.setAnimationLoop(()=>{this.handleGamepadInput()});


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
}
