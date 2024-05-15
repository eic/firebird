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

function ensureColor(material: any) {

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

    let {rootGeoManager, rootObject3d} = await this.geomService.loadEicGeometry();
    let threeManager = this.eventDisplay.getThreeManager();
    let uiManager = this.eventDisplay.getUIManager();
    let openThreeManager: any = threeManager;
    let importManager = openThreeManager.importManager;
    const doubleSided = true;

    const sceneGeometry = threeManager.getSceneManager().getGeometries();

    if (scale) {
      rootObject3d.scale.setScalar(scale);
    }
    sceneGeometry.add(rootObject3d);
    console.log("CERN ROOT converted to Object3d: ", rootObject3d);
    //rootGeometry.visible = initiallyVisible;

    //sceneGeometry.add(rootGeometry);
    let topLevelRootItems = getGeoNodesByLevel(rootGeoManager);
    let topLevelObj3dNodes = rootObject3d.children[0].children;

    if(topLevelRootItems.length != topLevelObj3dNodes.length) {
      console.warn(`topLevelRootItems.length != topLevelObj3dNodes.length`);
      console.log("Can't create Menu Items");
    }
    else {
      for(let i=0; i < topLevelRootItems.length; i++) {
        let rootGeoNode = topLevelRootItems[i].geoNode;
        let obj3dNode = topLevelObj3dNodes[i];
        obj3dNode.name = obj3dNode.userData["name"] = rootGeoNode.name;

        // Add geometry
        uiManager.addGeometry(obj3dNode, obj3dNode.name);
      }
    }

    let renderer  = openThreeManager.rendererManager;

    const glassMaterial = new MeshPhysicalMaterial({
      color: 0xffff00, // Yellow color
      metalness: 0,
      roughness: 0,
      transmission: 0.7, // High transparency
      opacity: 1,
      transparent: true,
      reflectivity: 0.5
    });



    // Now we want to change the materials
    sceneGeometry.traverse( (child: any) => {

      if(child.type!=="Mesh") {
        return;
      }

      if(!child?.material?.isMaterial) {
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
        transparent: transparent,
        opacity: opacity,
        clippingPlanes: openThreeManager.clipPlanes,
        clipIntersection: true,
        clipShadows: false
      });

      // Material
      let name:string = child.name;


      if(name.startsWith("bar_") || name.startsWith("prism_")) {
        child.material = glassMaterial;
      }

      if(! child.material?.clippingPlanes !== undefined) {
        child.material.clippingPlanes = openThreeManager.clipPlanes;
      }

      if(! child.material?.clipIntersection !== undefined) {
        child.material.clipIntersection = true;
      }

      if(! child.material?.clipShadows !== undefined) {
        child.material.clipShadows = false;
      }

    //   if (!(child instanceof Mesh)) {
    //     return;
    //   }
    //   child.userData["size"] = importManager.getObjectSize(child);
    //   if (!(child.material instanceof Material)) {
    //     return;
    //   }
    //   const color = child.material['color']
    //     ? child.material['color']
    //     : 0x2fd691;
    //   const side = doubleSided ? DoubleSide : child.material['side'];
    //   child.material.dispose();
    //   let isTransparent = false;
    //   if (rootGeometry.userData.opacity) {
    //     isTransparent = true;
    //   }
    //   child.material = new MeshPhongMaterial({
    //     color,
    //     shininess: 0,
    //     side: side,
    //     transparent: isTransparent,
    //     opacity: (_a = rootGeometry.userData.opacity) !== null && _a !== void 0 ? _a : 1,
    //   });
    //   child.material.clippingPlanes = openThreeManager.clipPlanes;
    //   child.material.clipIntersection = true;
    //   child.material.clipShadows = false;
    });

    let scene = threeManager.getSceneManager().getScene();
    let camera = openThreeManager.controlsManager.getMainCamera();
    produceRenderOrder(scene, camera.position, 'dflt');

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
        eventFile: 'assets/herwig_5x41_5evt_showers.json',
        eventType: 'json'   // or zip
      },
    }

    // Initialize the event display
    this.eventDisplay.init(configuration);
    this.eventDisplay.getUIManager().setClipping(true);
    this.eventDisplay.getUIManager().rotateOpeningAngleClipping(120);
    this.eventDisplay.getUIManager().rotateStartAngleClipping(45);


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

    });

    this.eventDisplay
      .getLoadingManager()
      .addProgressListener((progress) => (this.loadingProgress = progress));

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

    // Load the default configuration
    this.eventDisplay.getLoadingManager().addLoadListenerWithCheck(() => {
      console.log('Loading default configuration.');
      this.loaded = true;

    });

  }

}
