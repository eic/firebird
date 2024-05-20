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
import {disposeHierarchy, findObject3DNodes, getColorOrDefault} from "../utils/three.utils";
import {mergeMeshList, MergeResult} from "../utils/three-geometry-merge";


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

  constructor(
    private geomService: GeometryService,
    private eventDisplay: EventDisplayService,
    private route: ActivatedRoute) { }

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


    // Add top nodes to menu
    let topLevelObj3dNodes = rootObject3d.children[0].children;

    for(let i= topLevelObj3dNodes.length - 1; i >= 0; i--) {
      console.log(`${i} : ${topLevelObj3dNodes[i].name}`);
    }

    console.log("DISPOSING");
    for(let i= topLevelObj3dNodes.length - 1; i >= 0; i--){
      let obj3dNode = topLevelObj3dNodes[i];
      console.log(`${i} : ${topLevelObj3dNodes[i].name}`);
      obj3dNode.name = obj3dNode.userData["name"] = obj3dNode.name;
      // Add geometry
      // uiManager.addGeometry(obj3dNode, obj3dNode.name);

      if(obj3dNode.name == "EcalEndcapN_21") {
        let crystals = findObject3DNodes(obj3dNode, "**/crystal_vol_0", "Mesh").nodes;
        //console.log(crystals);

        let mergeResult: MergeResult = mergeMeshList(crystals, obj3dNode, "crystals");
        for (let mesh of mergeResult.childrenToRemove) {
          (mesh as THREE.Mesh).visible = false;
        }

      } else {

        try {
          obj3dNode.removeFromParent();
        }
        catch (e) {
          console.error(e);
        }


        try {
          console.log("disposeHierarchy: ", obj3dNode.name,  obj3dNode);
          disposeHierarchy(obj3dNode);
        } catch (e) {
          console.error(e);
        }


        //mergeBranchGeometries(obj3dNode, obj3dNode.name + "_merged");
      }
    }

    let renderer  = openThreeManager.rendererManager;

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
    gui.add(this, "produceRenderOrder");

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
