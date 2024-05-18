import { Component, OnInit } from '@angular/core';
import { EventDisplayService } from 'phoenix-ui-components';
import { Configuration, PhoenixLoader, PresetView, ClippingSetting, PhoenixMenuNode } from 'phoenix-event-display';
import {
  Color,
  DoubleSide,
  Mesh,
  LineSegments,
  LineBasicMaterial,
  MeshPhongMaterial,
  Material,
  ObjectLoader,
  FrontSide,
  Vector3,
  Matrix4,
  REVISION,
  MeshPhysicalMaterial,
} from "three";
import { PhoenixUIModule } from 'phoenix-ui-components';
import { GeometryService} from '../geometry.service';
import { Edm4hepRootEventLoader } from '../edm4hep-root-event-loader';
import { ActivatedRoute } from '@angular/router';
import {color} from "three/examples/jsm/nodes/shadernode/ShaderNode";
import {getGeoNodesByLevel} from "../utils/cern-root.utils";
import {produceRenderOrder} from "jsrootdi/geom";
import {wildCardCheck} from "../utils/wildcard";
import {ThreeGeometryProcessor} from "../three-geometry.processor";
import * as THREE from 'three';
import { mergeGeometries  } from 'three/examples/jsm/utils/BufferGeometryUtils';

interface Colorable {
  color: Color;
}

function isColorable(material: any): material is Colorable {
  return 'color' in material;
}

function getColorOrDefault(material:any, defaultColor: Color): Color {
  if (isColorable(material)) {
    return material.color;
  } else {
    return defaultColor;
  }
}

/**
 * Merges all geometries in a branch of the scene graph into a single geometry.
 * @param parentNode The parent node of the branch to merge.
 * @returns void
 */
function mergeBranchGeometries(parentNode: THREE.Object3D): void {
  const geometries: THREE.BufferGeometry[] = [];
  let material: THREE.Material | undefined;
  const childrenToRemove: THREE.Object3D[] = [];

  // Recursively collect geometries from the branch
  const collectGeometries = (node: THREE.Object3D): void => {
    node.traverse((child: any) => {

      let isBufferGeometry = child?.geometry?.isBufferGeometry ?? false;
      console.log(isBufferGeometry);
      if (isBufferGeometry) {
        child.updateMatrixWorld(true);
        const clonedGeometry = child.geometry.clone();
        clonedGeometry.applyMatrix4(child.matrixWorld);
        geometries.push(clonedGeometry);
        material = material || child.material;
        childrenToRemove.push(child);
      }
    });
  };

  collectGeometries(parentNode);

  if (geometries.length === 0 || !material) {
    console.warn('No geometries found or material missing.');
    return;
  }

  // Merge all collected geometries
  const mergedGeometry = mergeGeometries(geometries, false);


  // Transform the merged geometry to the local space of the parent node
  const parentInverseMatrix = new THREE.Matrix4().copy(parentNode.matrixWorld).invert();
  mergedGeometry.applyMatrix4(parentInverseMatrix);

  // Create a new mesh with the merged geometry and the collected material
  const mergedMesh = new THREE.Mesh(mergedGeometry, material);

  // Remove the original children that are meshes and add the new merged mesh
  // Remove and dispose the original children
  childrenToRemove.forEach((child: any) => {
    child.geometry.dispose();
    child?.parent?.remove(child);
  });



  parentNode.add(mergedMesh);
}



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
    console.log("CERN ROOT converted to Object3d: ", rootObject3d);
    sceneGeometry.add(rootObject3d);


    // Add top nodes to menu
    let topLevelObj3dNodes = rootObject3d.children[0].children;
    for(let obj3dNode of topLevelObj3dNodes){
      obj3dNode.name = obj3dNode.userData["name"] = obj3dNode.name;

        // Add geometry
      uiManager.addGeometry(obj3dNode, obj3dNode.name);

      mergeBranchGeometries(obj3dNode);

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
    let camera = openThreeManager.controlsManager.getMainCamera();
    // produceRenderOrder(scene, camera.position, 'dflt');


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
      defaultView: [-4500, 12000, 0, 0, 0 ,0],

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


    // Set default clipping
    this.eventDisplay.getUIManager().setClipping(true);
    this.eventDisplay.getUIManager().rotateOpeningAngleClipping(120);
    this.eventDisplay.getUIManager().rotateStartAngleClipping(45);

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
