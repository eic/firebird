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


export class ThreeGeometryProcessor {

  rules: DetectorThreeRuleSet[] = [
    {
      names: ["FluxBarrel_env_25", "FluxEndcapP_26", "FluxEndcapN_28"],
      rules: []
    },

    {
      name: "VertexBarrelSubAssembly_3",
      rules: []
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

    // Add top nodes to menu
    //let topDetectorNodes = geometry.children[0].children;

    // for(let i= topLevelObj3dNodes.length - 1; i >= 0; i--) {
    //   console.log(`${i} : ${topLevelObj3dNodes[i].name}`);
    // }


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

  public processRuleSets(ruleSets: DetectorThreeRuleSet[], allDetectors: Subdetector[]) {
    for(let ruleSet of ruleSets) {
      this.processRuleSet(ruleSet, allDetectors);
    }
  }

  public processRuleSet(ruleSet: DetectorThreeRuleSet, allDetectors: Subdetector[]) {
    let names: Set<string> = new Set<string>(ruleSet.names? ruleSet.names: []);

    // User provided names and name... this is probably a mistake, but we will just process all
    // Such mistake happens when JSON rules are edited by users and they don't deserve an exception raise
    if(ruleSet.name && !names.has(ruleSet.name)) {
      names.add(ruleSet.name);
    }

    for(const name of names) {
      let detector = allDetectors.find(det => det.sourceGeometryName === name);
      if (detector) {
        for (let rule of ruleSet.rules) {
          editThreeNodeContent(detector.geometry, rule);
        }
      }
    }
  }
}
