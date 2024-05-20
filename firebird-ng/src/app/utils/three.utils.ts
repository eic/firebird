import outmatch from 'outmatch';

import * as THREE from "three";
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';
import {GeoNodeWalkCallback, walkGeoNodes} from "./cern-root.utils";

export type NodeWalkCallback = (node: any, nodeFullPath: string, level: number) => boolean;

interface NodeWalkOptions {
  maxLevel?: number;
  level?: number;
  parentPath?: string;
  pattern?: any;
}

export function walkObject3DNodes(node: any, callback: NodeWalkCallback|null, options: NodeWalkOptions={}):number {

  // Dereference options
  let { maxLevel = Infinity, level = 0, parentPath = "", pattern=null } = options;

  if(!level) {
    level = 0;
  }

  // Check pattern is string or not?
  // We assume the pattern is an outmatch object or a string. We need compiled outmatch
  if(pattern) {
    pattern = typeof pattern === "string"? outmatch(pattern): pattern;
  }

  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  let processedNodes = 1;

  // Only invoke the callback if no pattern is provided or if the pattern matches the fullPath
  if (!pattern || pattern(fullPath)) {
    if(callback){
      callback(node, fullPath, level);
    }
  }

  // Continue recursion to child nodes if they exist and the max level is not reached
  if (node?.children && level < maxLevel) {
    // Iterate backwards so if elements of array are removed it is safe
    // Still removing elements are discouraged
    for (let i = node.children.length-1; i >= 0; i--) {
      let child = node.children[i];
      if (child) {
        processedNodes += walkObject3DNodes(child, callback, {maxLevel, level: level + 1, parentPath: fullPath, pattern});
      }
    }
  }

  return processedNodes;
}



export function findObject3DNodes(parentNode: any, pattern: string, matchType="", maxLevel:number=Infinity): any[] {
  let matchingNodes: {node: any, fullPath: string}[] = [];

  // Define a callback using the GeoNodeWalkCallback type
  const collectNodes: NodeWalkCallback = (node, fullPath, level) => {

    if(!matchType || matchType === node.type) {
      matchingNodes.push({node: node, fullPath: fullPath});
    }
    return true; // go through children
  };

  // Use walkGeoNodes with the collecting callback and the pattern
  walkObject3DNodes(parentNode, collectNodes, {maxLevel, pattern});
  return matchingNodes;
}



export interface Colorable {
  color: THREE.Color;
}


/**
 * Type guard function to check if the material is colorable.
 * @param material - The material to check.
 * @returns true if the material has a 'color' property, false otherwise.
 */
export function isColorable(material: any): material is Colorable {
  return 'color' in material;
}


/**
 * Retrieves the color of a material if it is colorable; otherwise, returns a default color.
 * @param material - The material whose color is to be retrieved.
 * @param defaultColor - The default color to return if the material is not colorable.
 * @returns The color of the material if colorable, or the default color.
 */
export function getColorOrDefault(material:any, defaultColor: THREE.Color): THREE.Color {
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
export function mergeBranchGeometries(parentNode: THREE.Object3D, name: string): void {
  const geometries: THREE.BufferGeometry[] = [];
  let material: THREE.Material | undefined;
  const childrenToRemove: THREE.Object3D[] = [];

  // Recursively collect geometries from the branch
  const collectGeometries = (node: THREE.Object3D): void => {
    node.traverse((child: any) => {

      let isBufferGeometry = child?.geometry?.isBufferGeometry ?? false;
      //console.log(isBufferGeometry);
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
    // Remove empty parents
    if( (child?.parent?.children?.length ?? 1) === 0 ) {
      child?.parent?.parent?.remove(child.parent);
    }
  });

  mergedMesh.name = name;

  parentNode.add(mergedMesh);
}




/**
 * Merges all geometries from a list of meshes into a single geometry and attaches it to a new parent node.
 * @param meshes An array of THREE.Mesh objects whose geometries are to be merged.
 * @param parentNode The new parent node to which the merged mesh will be added.
 * @param name The name to assign to the merged mesh.
 * @returns void
 */
export function mergeMeshList(meshes: THREE.Mesh[], parentNode: THREE.Object3D, name: string): void {
  const geometries: THREE.BufferGeometry[] = [];
  let material: THREE.Material | undefined;

  // Collect geometries and materials from the provided meshes
  meshes.forEach(mesh => {
    if (mesh.geometry?.isBufferGeometry) {
      mesh.updateMatrixWorld(true);
      const clonedGeometry = mesh.geometry.clone();
      clonedGeometry.applyMatrix4(mesh.matrixWorld);
      geometries.push(clonedGeometry);
      // Check if mesh.material is an array and handle it
      if (!material) { // Only set if material has not been set yet
        if (Array.isArray(mesh.material)) {
          material = mesh.material[0]; // Use the first material if it's an array
        } else {
          material = mesh.material; // Use the material directly if it's not an array
        }
      }
    }
  });

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
  mergedMesh.name = name;
  parentNode.add(mergedMesh);

  // Optionally, dispose of the original geometries to free up resources
  geometries.forEach(geo => geo.dispose());
}

