import {Injectable, signal, WritableSignal} from '@angular/core';
import {openFile} from 'jsroot';
import {
  analyzeGeoNodes,
  findGeoManager, getGeoNodesByLevel
} from '../../lib-root-geometry/root-geo-navigation';
import {build} from 'jsroot/geom';
import {pruneTopLevelDetectors, RootGeometryProcessor} from "../data-pipelines/root-geometry.processor";
import {LocalStorageService} from "./local-storage.service";
import {Subdetector} from "../model/subdetector";
import {Color, DoubleSide, MeshLambertMaterial, NormalBlending, Object3D, Plane} from "three";
import {UrlService} from "./url.service";
import {DetectorThreeRuleSet, ThreeGeometryProcessor} from "../data-pipelines/three-geometry.processor";
import * as THREE from "three";
import {disposeHierarchy, getColorOrDefault} from "../utils/three.utils";

import {cool2ColorRules} from "../theme/cool2-geometry-ruleset";
import {cadColorRules} from "../theme/cad-geometry-ruleset";
import {monoColorRules} from "../theme/mono-geometry-ruleset";
import {cool2NoOutlineColorRules} from "../theme/cool2no-geometry-ruleset";


export const GROUP_CALORIMETRY = "Calorimeters";
export const GROUP_TRACKING = "Tracking";
export const GROUP_PID = "PID";
export const GROUP_MAGNETS = "Magnets";
export const GROUP_SUPPORT = "Beam pipe and support";
export const ALL_GROUPS = [
  GROUP_CALORIMETRY,
  GROUP_TRACKING,
  GROUP_PID,
  GROUP_MAGNETS,
  GROUP_SUPPORT,
]

export const defaultRules: DetectorThreeRuleSet[] = [
  {
    names: ["FluxBarrel_env_25", "FluxEndcapP_26", "FluxEndcapN_28"],
    rules: [
      {
        color: 0x373766,

      }
    ]
  },
  {
    name: "EcalEndcapN*",
    rules: [
      {
        patterns: ["**/crystal_vol_0"],
        color: 0xffef8b,
        material: new THREE.MeshStandardMaterial({
          color: 0xffef8b,
          roughness: 0.7,
          metalness: 0.869,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide
        })
      },
      {
        patterns: ["**/inner_support*", "**/ring*"],
        material: new THREE.MeshStandardMaterial({
          color: 0x19a5f5,
          roughness: 0.7,
          metalness: 0.869,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide
        })
      }

    ]
  },
  {
    name: "InnerTrackerSupport_assembly_13",
    rules: [
      {
        material: new THREE.MeshStandardMaterial({
          color: 0xEEEEEE,
          roughness: 0.7,
          metalness: 0.3,
          transparent: true,
          opacity: 0.8,
          blending: THREE.NormalBlending,
          // premultipliedAlpha: true,
          depthWrite: false, // Ensures correct blending
          polygonOffset: true,
          polygonOffsetFactor: 1,
          side: THREE.DoubleSide
        }),
        outline: true,
        outlineColor: 0x666666,
        merge: true,
        newName: "InnerTrackerSupport"
      }
    ]
  },
  {
    name: "DIRC_14",
    rules: [
      {
        patterns:     ["**/*box*", "**/*prism*"],
        material: new THREE.MeshPhysicalMaterial({
          color: 0xe5ba5d,
          metalness: .9,
          roughness: .05,
          envMapIntensity: 0.9,
          clearcoat: 1,
          transparent: true,
          //transmission: .60,
          opacity: .6,
          reflectivity: 0.2,
          //refr: 0.985,
          ior: 0.9,
          side: THREE.DoubleSide,
        }),
        newName: "DIRC_barAndPrisms"
      },
      {
        patterns: ["**/*rail*"],
        newName: "DIRC_rails",
        color: 0xAAAACC
      },
      {
        patterns: ["**/*mcp*"],
        newName: "DIRC_mcps"
      }
    ]

  },
  {
    // This is when DIRC geometry is standalone
    name: "DIRC_0",
    rules: [
      {
        patterns:     ["**/*box*", "**/*prism*"],
        material: new THREE.MeshPhysicalMaterial({
          color: 0xe5ba5d,
          metalness: .9,
          roughness: .05,
          envMapIntensity: 0.9,
          clearcoat: 1,
          transparent: true,
          //transmission: .60,
          opacity: .6,
          reflectivity: 0.2,
          //refr: 0.985,
          ior: 0.9,
          side: THREE.DoubleSide,
        }),
        newName: "DIRC_barAndPrisms",
        merge: false,
        outline: true
      },
      {
        patterns: ["**/*rail*"],
        newName: "DIRC_rails",
        color: 0xAAAACC
      },
      {
        patterns: ["**/*mcp*"],
        newName: "DIRC_mcps"
      }
    ]

  },
  {
    name: "VertexBarrelSubAssembly_3",
    rules: [
      {
        merge: true,
        outline: true
      }
    ]
  },
  {
    name: "*",
    rules: [
      {
        merge: true,
        outline: true
      }
    ]
  }
]

/**
 * Detectors (top level TGeo nodes) to be removed.
 * (!) startsWith function is used for filtering (aka: detector.fName.startsWith(removeDetectorNames[i]) ... )
 */
const removeDetectorNames: string[] = [
  "Lumi",
  //"Magnet",
  //"B0",
  "B1",
  "B2",
  //"Q0",
  //"Q1",
  "Q2",
  //"BeamPipe",
  //"Pipe",
  "ForwardOffM",
  "Forward",
  "Backward",
  "Vacuum",
  "SweeperMag",
  "AnalyzerMag",
  "ZDC",
  //"LFHCAL",
  "HcalFarForward",
  "InnerTrackingSupport"
];


// constants.ts
export const DEFAULT_GEOMETRY = 'builtin://epic-central-optimized';

@Injectable({
  providedIn: 'root'
})
export class GeometryService {

  public rootGeometryProcessor = new RootGeometryProcessor();

  /** Collection of subdetectors */
  public subdetectors: Subdetector[] = [];

  /** TGeoManager if available */
  public rootGeometry: any|null = null;

  /** Main/entry/root THREEJS geometry tree node with the whole geometry */
  // public geometry:

  public groupsByDetName: Map<string, string>;

  /** for geometry post-processing */
  private threeGeometryProcessor = new ThreeGeometryProcessor();

  private defaultColor: Color = new Color(0x68698D);

  public geometry:WritableSignal<Object3D|null> = signal(null)

  constructor(private urlService: UrlService,
              private localStorage: LocalStorageService,
              ) {
    this.groupsByDetName = new Map<string,string> ([
      ["SolenoidBarrel_assembly_0", GROUP_MAGNETS],
      ["SolenoidEndcapP_1", GROUP_MAGNETS],
      ["SolenoidEndcapN_2", GROUP_MAGNETS],
      ["VertexBarrelSubAssembly_3", GROUP_TRACKING],
      ["InnerSiTrackerSubAssembly_4", GROUP_TRACKING],
      ["MiddleSiTrackerSubAssembly_5", GROUP_TRACKING],
      ["OuterSiTrackerSubAssembly_6", GROUP_TRACKING],
      ["EndcapMPGDSubAssembly_7", GROUP_TRACKING],
      ["InnerMPGDBarrelSubAssembly_8", GROUP_TRACKING],
      ["EndcapTOFSubAssembly_9", GROUP_PID],
      ["BarrelTOFSubAssembly_10", GROUP_PID],
      ["OuterBarrelMPGDSubAssembly_11", GROUP_TRACKING],
      ["B0TrackerSubAssembly_12", GROUP_TRACKING],
      ["InnerTrackerSupport_assembly_13", GROUP_SUPPORT],
      ["DIRC_14", GROUP_PID],
      ["RICHEndcapN_Vol_15", GROUP_PID],
      ["DRICH_16", GROUP_PID],
      ["EcalEndcapP_17", GROUP_CALORIMETRY],
      ["EcalEndcapPInsert_18", GROUP_CALORIMETRY],
      ["EcalBarrelImaging_19", GROUP_CALORIMETRY],
      ["EcalBarrelScFi_20", GROUP_CALORIMETRY],
      ["EcalEndcapN_21", GROUP_CALORIMETRY],
      ["LFHCAL_env_22", GROUP_CALORIMETRY],
      ["HcalEndcapPInsert_23", GROUP_CALORIMETRY],
      ["HcalBarrel_24", GROUP_CALORIMETRY],
      ["FluxBarrel_env_25", GROUP_SUPPORT],
      ["FluxEndcapP_26", GROUP_SUPPORT],
      ["HcalEndcapN_27", GROUP_CALORIMETRY],
      ["FluxEndcapN_28", GROUP_SUPPORT],
      ["BeamPipe_assembly_29", GROUP_SUPPORT],
      ["B0PF_BeamlineMagnet_assembly_30", GROUP_MAGNETS],
      ["B0APF_BeamlineMagnet_assembly_31", GROUP_MAGNETS],
      ["Q1APF_BeamlineMagnet_assembly_32", GROUP_MAGNETS],
      ["Q1BPF_BeamlineMagnet_assembly_33", GROUP_MAGNETS],
      ["BeamPipeB0_assembly_38", GROUP_SUPPORT],
      ["Pipe_cen_to_pos_assembly_39", GROUP_SUPPORT],
      ["Q0EF_assembly_40", GROUP_MAGNETS],
      ["Q0EF_vac_41", GROUP_MAGNETS],
      ["Q1EF_assembly_42", GROUP_MAGNETS],
      ["Q1EF_vac_43", GROUP_MAGNETS],
      ["B0ECal_44", GROUP_CALORIMETRY],
      ["Pipe_Q1eR_to_B2BeR_assembly_54", GROUP_SUPPORT],
      ["Magnet_Q1eR_assembly_55", GROUP_MAGNETS],
      ["Magnet_Q2eR_assembly_56", GROUP_MAGNETS],
      ["Magnet_B2AeR_assembly_57", GROUP_MAGNETS],
      ["Magnet_B2BeR_assembly_58", GROUP_MAGNETS],
      ["Magnets_Q3eR_assembly_59", GROUP_MAGNETS],
    ])
  }


  async loadGeometry(url:string): Promise<{rootGeometry: any|null, threeGeometry: Object3D|null}> {

    this.subdetectors = [];
    //let url: string = 'assets/epic_pid_only.root';
    //let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_dirc_only.root';
    // let url: string = 'https://eic.github.io/epic/artifacts/tgeo/epic_full.root';
    // >oO let objectName = 'default';

    if(url === DEFAULT_GEOMETRY) {
      url = 'https://eic.github.io/epic/artifacts/tgeo/epic_full.root';
    }
    // TODO check aliases

    const finalUrl = this.urlService.resolveDownloadUrl(url);

    console.time('[GeometryService]: Total load geometry time');
    console.log(`[GeometryService]: Loading file ${finalUrl}`)

    console.time('[GeometryService]: Open root file');
    const file = await openFile(finalUrl);
    // >oO debug console.log(file);
    console.timeEnd('[GeometryService]: Open root file');


    console.time('[GeometryService]: Reading geometry from file');
    this.rootGeometry = await findGeoManager(file) // await file.readObject(objectName);
    // >oO
    // console.log("Got TGeoManager. For inspection:")
    // console.log(this.rootGeometry);
    console.timeEnd('[GeometryService]: Reading geometry from file');


    // Getting main detector nodes
    if(this.localStorage.geometryCutListName.value === "central") {
      let result = pruneTopLevelDetectors(this.rootGeometry, removeDetectorNames);
      console.log(`[GeometryService]: Done prune geometry. Nodes left: ${result.nodes.length}, Nodes removed: ${result.removedNodes.length}`);
    } else {
      console.log("[GeometryService]: Prune geometry IS OFF");

    }

    if(this.localStorage.geometryRootFilterName.value === "default") {
      console.time('[GeometryService]: Root geometry pre-processing');
      this.rootGeometryProcessor.process(this.rootGeometry);
      console.timeEnd('[GeometryService]: Root geometry pre-processing');
    } else {
      console.log("[GeometryService]: Root geometry pre-processing IS OFF");
    }


    console.log("[GeometryService]: Number of tree elements analysis:");
    analyzeGeoNodes(this.rootGeometry, 1);

    //
    console.time('[GeometryService]: Build geometry');
    const geometry = build(this.rootGeometry,
      {
        numfaces: 5000000000,
        numnodes: 5000000000,
        instancing:-1,
        dflt_colors: false,
        vislevel: 200,
        doubleside:true,
        transparency:true
      });
    console.timeEnd('[GeometryService]: Build geometry');

    // Validate the geometry
    if(!geometry) {
      throw new Error("Geometry is null or undefined after TGeoPainter.build");
    }

    if(!geometry.children.length) {
      throw new Error("Geometry is converted but empty. Anticipated 'world_volume' but got nothing");
    }

    if(!geometry.children[0].children.length) {
      throw new Error("Geometry is converted but empty. Anticipated array of top level nodes (usually subdetectors) but got nothing");
    }

    // We now know it is not empty array
    console.time('[GeometryService]: Map root geometry to threejs geometry');
    let topDetectorNodes = geometry.children[0].children;
    for(const topNode of topDetectorNodes) {

      // Process name
      const originalName = topNode.name;
      const name = this.stripIdFromName(originalName);   // Remove id in the end EcalN_21 => Ecal

      const rootGeoNodes = getGeoNodesByLevel(this.rootGeometry, 1).map(obj=>obj.geoNode);
      const rootNode = rootGeoNodes.find(obj => obj.fName === originalName);

      let subdetector: Subdetector = {
        sourceGeometry: rootNode,
        sourceGeometryName: rootNode?.fName ?? "",
        geometry: topNode,
        name: this.stripIdFromName(originalName),
        groupName: this.groupsByDetName.get(originalName) || ""
      }
      // console.log(subdetector.sourceGeometryName);
      this.subdetectors.push(subdetector);
    }
    console.timeEnd('[GeometryService]: Map root geometry to threejs geometry');

    console.timeEnd('[GeometryService]: Total load geometry time');

    this.geometry.set(geometry);

    return {rootGeometry: this.rootGeometry, threeGeometry: geometry};
  }

  public postProcessing(geometry: Object3D, clippingPlanes: Plane[]) {
    let threeGeometry  = this.geometry();
    if (!threeGeometry) return;


    // Now we want to set default materials
    threeGeometry.traverse((child: any) => {
      if (child.type !== 'Mesh' || !child?.material?.isMaterial) {
        return;
      }

      // Handle the material of the child
      const color = getColorOrDefault(child.material, this.defaultColor);

      if(this.localStorage.geometryFastAndUgly.value) {
        child.material = new MeshLambertMaterial({
          color: color,
          side: DoubleSide,           // you said you can’t change this
          transparent: false,
          opacity: 1,                 // false transparency; use 1 for full opacity
          blending: THREE.NoBlending,       // since transparent is false
          depthTest: true,
          depthWrite: true,
          clippingPlanes,
          clipIntersection: true,
          clipShadows: false,
          fog: false,                 // disable fog math
          vertexColors: false,        // disable vertex-color math
          flatShading: true,          // simpler “flat” shading
          toneMapped: false           // skip tone-mapping
        });
      } else {
        child.material = new MeshLambertMaterial({
          color: color,
          side: DoubleSide,
          transparent: true,
          opacity: 0.7,
          blending: NormalBlending,
          depthTest: true,
          depthWrite: true,
          clippingPlanes: clippingPlanes,
          clipIntersection: true,
          clipShadows: false,
        });

      }
    });


    // HERE WE DO POSTPROCESSING STEP
    // TODO this.threeGeometryProcessor.processRuleSets(defaultRules, this.subdetectors);
    console.log(`[GeometryService]: Geometry theme name is set to '${this.localStorage.geometryThemeName.value}'`);
    if(this.localStorage.geometryThemeName.value === "cool2") {
      this.threeGeometryProcessor.processRuleSets(cool2ColorRules, this.subdetectors);
    }else if(this.localStorage.geometryThemeName.value === "cool2no") {
      this.threeGeometryProcessor.processRuleSets(cool2NoOutlineColorRules, this.subdetectors);
    } else if(this.localStorage.geometryThemeName.value === "cad") {
      this.threeGeometryProcessor.processRuleSets(cadColorRules, this.subdetectors);
    } else if(this.localStorage.geometryThemeName.value === "grey") {
      this.threeGeometryProcessor.processRuleSets(monoColorRules, this.subdetectors);
    }



    // Now we want to change the materials
    threeGeometry.traverse((child: any) => {
      if (!child?.material?.isMaterial) {
        return;
      }

      if (child.material?.clippingPlanes !== undefined) {
        child.material.clippingPlanes = clippingPlanes;
      }

      if (child.material?.clipIntersection !== undefined) {
        child.material.clipIntersection = true;
      }

      if (child.material?.clipShadows !== undefined) {
        child.material.clipShadows = false;
      }
    });
  }

  private stripIdFromName(name: string) {
      return name.replace(/_\d+$/, '');
  }

  toggleVisibility(object: Object3D) {
    if (object) {
      object.visible = !object.visible;
      console.log(`Visibility toggled for object: ${object.name}. Now visible: ${object.visible}`);
    }
  }
}

