import {Injectable} from '@angular/core';
import {openFile} from 'jsroot';
import {
  analyzeGeoNodes,
  findGeoManager, getGeoNodesByLevel
} from '../../lib-root-geometry/root-geo-navigation';
import {build} from 'jsroot/geom';
import {RootGeometryProcessor} from "../data-pipelines/root-geometry.processor";
import {UserConfigService} from "./user-config.service";
import {Subdetector} from "../model/subdetector";
import {Color, DoubleSide, MeshLambertMaterial, NormalBlending, Object3D, Plane} from "three";
import {UrlService} from "./url.service";
import {DetectorThreeRuleSet, ThreeGeometryProcessor} from "../data-pipelines/three-geometry.processor";
import * as THREE from "three";
import {disposeHierarchy, getColorOrDefault} from "../utils/three.utils";

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
  public geometry: Object3D|null = null;

  public groupsByDetName: Map<string, string>;

  /** for geometry post-processing */
  private threeGeometryProcessor = new ThreeGeometryProcessor();

  private defaultColor: Color = new Color(0x68698D);

  constructor(private urlService: UrlService) {
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
    console.log("Got TGeoManager. For inspection:")
    console.log(this.rootGeometry);
    console.timeEnd('[GeometryService]: Reading geometry from file');


    console.time('[GeometryService]: Root geometry pre-processing');
    this.rootGeometryProcessor.process(this.rootGeometry);
    console.time('[GeometryService]: Root geometry pre-processing');

    analyzeGeoNodes(this.rootGeometry, 1);

    //
    console.time('[GeometryService]: Build geometry');
    this.geometry = build(this.rootGeometry,
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
    if(!this.geometry) {
      throw new Error("Geometry is null or undefined after TGeoPainter.build");
    }

    if(!this.geometry.children.length) {
      throw new Error("Geometry is converted but empty. Anticipated 'world_volume' but got nothing");
    }

    if(!this.geometry.children[0].children.length) {
      throw new Error("Geometry is converted but empty. Anticipated array of top level nodes (usually subdetectors) but got nothing");
    }

    // We now know it is not empty array
    console.time('[GeometryService]: Map root geometry to threejs geometry');
    let topDetectorNodes = this.geometry.children[0].children;
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
      console.log(subdetector.sourceGeometryName);
      this.subdetectors.push(subdetector);
    }
    console.timeEnd('[GeometryService]: Map root geometry to threejs geometry');


    console.timeEnd('[GeometryService]: Total load geometry time');
    return {rootGeometry: this.rootGeometry, threeGeometry: this.geometry};
  }

  public postProcessing(geometry: Object3D, clippingPlanes: Plane[]) {
    let threeGeometry  = this.geometry;
    if (!threeGeometry) return;


    // Now we want to set default materials
    threeGeometry.traverse((child: any) => {
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
        clippingPlanes: clippingPlanes,
        clipIntersection: true,
        clipShadows: false,
      });
    });

    // HERE WE DO POSTPROCESSING STEP
    this.threeGeometryProcessor.processRuleSets(defaultRules, this.subdetectors);

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

