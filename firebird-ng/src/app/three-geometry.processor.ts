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
  MeshStandardMaterial,
  ShaderMaterial,
  EdgesGeometry,
} from "three";
import { PhoenixUIModule } from 'phoenix-ui-components';
import { GeometryService} from './geometry.service';
import { Edm4hepRootEventLoader } from './edm4hep-root-event-loader';
import { ActivatedRoute } from '@angular/router';
import {color} from "three/examples/jsm/nodes/shadernode/ShaderNode";
import {getGeoNodesByLevel} from "./utils/cern-root.utils";
import {produceRenderOrder} from "jsrootdi/geom";
import {wildCardCheck} from "./utils/wildcard";

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

export class ThreeGeometryProcessor {

  glassMaterial = new LineBasicMaterial( {
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

  alphaMaterial = new MeshStandardMaterial( {
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

  }

  public process(geometry: any) {

    let shaderMaterial = new ShaderMaterial({
      uniforms: {
        thickness: {
          value: 1.5
        }
      },
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader
    });


    // Now we want to change the materials
    geometry.traverse( (child: any) => {

      if(child.type!=="Mesh") {
        return;
      }

      if(!child?.material?.isMaterial) {
        return;
      }

      // Material
      let name:string = child.name;

      //if(name.startsWith("bar_") || name.startsWith("prism_")) {
        //child.material = this.alphaMaterial;
        const edges = new EdgesGeometry(child.geometry);
        const lineMaterial = new LineBasicMaterial({
          color: 0x555555,
          fog: false,
          // Copy clipping planes from parent, using type assertion for TypeScript
          clippingPlanes: child.material.clippingPlanes ? child.material.clippingPlanes : [],
          clipIntersection: true,
          clipShadows: true

        });
        // lineMaterial.clipping = true;
        const edgesLine = new LineSegments(edges, lineMaterial);

        child.parent.add(edgesLine);

      //}
    });
  }
}
