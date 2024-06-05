import { Component, OnInit } from '@angular/core';
import { EventDisplayService } from 'phoenix-ui-components';
import { Configuration, PhoenixLoader, PresetView, ClippingSetting, PhoenixMenuNode } from 'phoenix-event-display';
import * as THREE from "three";
import { PhoenixUIModule } from 'phoenix-ui-components';
import { GeometryService} from './geometry.service';
import { Edm4hepRootEventLoader } from './edm4hep-root-event-loader';
import { ActivatedRoute } from '@angular/router';
import {color} from "three/examples/jsm/nodes/shadernode/ShaderNode";
import {getGeoNodesByLevel} from "./utils/cern-root.utils";
import {produceRenderOrder} from "jsrootdi/geom";
import {wildCardCheck} from "./utils/wildcard";
import {createOutline, disposeHierarchy, findObject3DNodes, pruneEmptyNodes} from "./utils/three.utils";
import {CalorimetryGeometryPrettifier} from "./geometry-prettifiers/calorimetry.prettifier";
import {mergeBranchGeometries} from "./utils/three-geometry-merge";
import {editThreeNodeContent, EditThreeNodeRule} from "./utils/three-geometry-editor";
import {Subdetector} from "./model/subdetector";


export interface DetectorThreeRuleSet {
  names?: string[];
  name?: string;
  rules: EditThreeNodeRule[];
}

/**
 * Matches which set of rules should be applied to which detectors
 *
 * - Detectors are matched based on their `sourceGeometryName` against the names specified in the rulesets.
 * - Rule lists are matched to detectors in the order they appear in the rulesets
 * - Once a rule is applied to a detector, that detector is excluded from further rule matching, ensuring each detector is processed only once.
 * - If both `names` and `name` are provided in a ruleset, the function treats it as a user error in JSON rule editing but processes both without raising an exception.
 * - If a ruleset contains a wildcard name (`"*"`), it will apply its rules to any detectors not already matched by previous rulesets. So it should be placed in
 *
 * @param {Subdetector[]} detectors - The list of detectors to which the rules will be applied.
 * @param {DetectorThreeRuleSet[]} ruleSets - The set of rules to be applied, processed sequentially.
 * @return {Map<Subdetector, EditThreeNodeRule[]>} - A map associating each detector with an array of the rules applied to it.
 */
export function matchRulesToDetectors(ruleSets: DetectorThreeRuleSet[], detectors: Subdetector[]): Map<Subdetector, EditThreeNodeRule[]> {
  const unassignedDetectors = new Set(detectors);
  const detectorRulesMap = new Map<Subdetector, EditThreeNodeRule[]>();

  for(let ruleSet of ruleSets) {
    const targets = new Set<Subdetector>();
    let names = new Set<string>(ruleSet.names || []);

    // Handle possible user error where both 'name' and 'names' are provided.
    if (ruleSet.name) {
      names.add(ruleSet.name);
    }

    for(let name of names) {
      for(let det of unassignedDetectors) {
        if (wildCardCheck(det.sourceGeometryName, name)) {
          targets.add(det);
          detectorRulesMap.set(det, ruleSet.rules || []);
          unassignedDetectors.delete(det);  // Move deletion here to optimize
        }
      }
    }
  }

  return detectorRulesMap;
}

export class ThreeGeometryProcessor {

  rules: DetectorThreeRuleSet[] = [
    {
      names: ["FluxBarrel_env_25", "FluxEndcapP_26", "FluxEndcapN_28"],
      rules: [
        {
          color: 0xFFFFFF,
        }
      ]
    },
    {
      name: "EndcapEcalN*",
      rules: [
        {
          patterns: ["**/crystal_vol_0"],
          color: 0xffef8b,
        },
        {
          patterns: ["**/inner_support*", "**/ring*"],
          material: new THREE.MeshStandardMaterial({
            color: 0x19a5f5,
            roughness: 0.7,
            metalness: 0.869,
            transparent: true,
            opacity: 1,
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
            opacity: 0.4,
            premultipliedAlpha: true,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            side: THREE.DoubleSide
          }),
          outline: true,
          outlineColor: 0xFF0000,
          merge: true

        }
      ]
    },
    {
      name: "VertexBarrelSubAssembly_3",
      rules: [

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

  calorimetry = new CalorimetryGeometryPrettifier();



  glassMaterial = new THREE.LineBasicMaterial( {
    color: 0xf1f1f1,
    linewidth: 1,
    linecap: 'round', //ignored by WebGLRenderer
    linejoin:  'round' //ignored by WebGLRenderer
  } );



  params = {
    alpha: 0.5,
    alphaHash: true,
    taa: true,
    sampleLevel: 2,
  };

  vertexShader = `
    varying vec2 vUv;
    void main()	{
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `;
  fragmentShader = `
		//#extension GL_OES_standard_derivatives : enable

    varying vec2 vUv;
    uniform float thickness;

    float edgeFactor(vec2 p){
    	vec2 grid = abs(fract(p - 0.5) - 0.5) / fwidth(p) / thickness;
  		return min(grid.x, grid.y);
    }

    void main() {

      float a = edgeFactor(vUv);

      vec3 c = mix(vec3(1), vec3(0), a);

      gl_FragColor = vec4(c, 1.0);
    }
  `;

  shaderMaterial: THREE.ShaderMaterial;

  alphaMaterial = new THREE.MeshStandardMaterial( {
    color: 0xffffff,
    alphaHash: this.params.alphaHash,
    opacity: this.params.alpha
  } );



  // new MeshPhysicalMaterial({
  //   color: 0xffff00, // Yellow color
  //   metalness: 0,
  //   roughness: 0,
  //   transmission: 0.7, // High transparency
  //   opacity: 1,
  //   transparent: true,
  //   reflectivity: 0.5
  // });

  constructor() {
    this.shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        thickness: {
          value: 1.5
        }
      },
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader
    });
  }

  public process(detectors: Subdetector[]) {

    this.processRuleSets(this.rules, detectors);

    //
    // // Add top nodes to menu
    // let topDetectorNodes = detectors.map(det=>det.geometry as THREE.Mesh);
    //
    // // for(let i= topLevelObj3dNodes.length - 1; i >= 0; i--) {
    // //   console.log(`${i} : ${topLevelObj3dNodes[i].name}`);
    // // }
    //
    //
    // console.log("DISPOSING");
    // for(let i= topDetectorNodes.length - 1; i >= 0; i--){
    //   let detNode = topDetectorNodes[i];
    //   console.log(`${i} : ${topDetectorNodes[i].name}`);
    //   detNode.name = detNode.userData["name"] = detNode.name;
    //   // Add geometry
    //   // uiManager.addGeometry(obj3dNode, obj3dNode.name);
    //
    //   if(detNode.name == "EcalEndcapN_21") {
    //     this.calorimetry.doEndcapEcalN(detNode);
    //   } else if(detNode.name == "DRICH_16") {
    //     this.calorimetry.doDRICH(detNode);
    //   } else if(detNode.name.startsWith("DIRC")) {
    //     this.calorimetry.doDIRC(detNode);
    //   } else{
    //
    //     // try {
    //     //   detNode.removeFromParent();
    //     // }
    //     // catch (e) {
    //     //   console.error(e);
    //     // }
    //     //
    //     // try {
    //     //   // console.log("disposeHierarchy: ", detNode.name,  detNode);
    //     //   disposeHierarchy(detNode);
    //     // } catch (e) {
    //     //   console.error(e);
    //     // }
    //
    //     let result = mergeBranchGeometries(detNode, detNode.name + "_merged");
    //     createOutline(result.mergedMesh);
    //     (result.mergedMesh.material as any).onBeforeCompile = (shader: any) => {
    //
    //       shader.fragmentShader = shader.fragmentShader.replace(
    //
    //         '#include <output_fragment>',
    //
    //         `
    //     vec3 backfaceColor = vec3( 0.4, 0.4, 0.4 );
    //     gl_FragColor = ( gl_FrontFacing ) ? vec4( outgoingLight, diffuseColor.a ) : vec4( backfaceColor, opacity );
    //     `
    //       )
    //     };
    //     pruneEmptyNodes(detNode);
    //   }
    // }
  }

  public processRuleSets(ruleSets: DetectorThreeRuleSet[], detectors: Subdetector[]) {
    let detRulesMap = matchRulesToDetectors(ruleSets, detectors);
    for (let [detector, ruleSet] of detRulesMap) {
      for(let rule of ruleSet) {
        editThreeNodeContent(detector.geometry, rule);
      }
    }
  }
}
