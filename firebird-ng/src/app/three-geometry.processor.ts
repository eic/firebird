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

  glassMaterial = new MeshPhysicalMaterial({
    color: 0xffff00, // Yellow color
    metalness: 0,
    roughness: 0,
    transmission: 0.7, // High transparency
    opacity: 1,
    transparent: true,
    reflectivity: 0.5
  });

  constructor() {

  }

  public process(geometry: any) {

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

      if(name.startsWith("bar_") || name.startsWith("prism_")) {
        child.material = this.glassMaterial;
      }
    });
  }
}
