import outmatch from 'outmatch';

import * as THREE from "three";
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';

export type NodeWalkCallback = (node: any, nodeFullPath: string, level: number) => boolean;

interface NodeWalkOptions {
  maxLevel?: number;
  level?: number;
  parentPath?: string;
  pattern?: any;
}

export function walkObject3dNodes(node: any, callback: NodeWalkCallback|null, options: NodeWalkOptions={}):number {

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
        processedNodes += walkObject3dNodes(child, callback, {maxLevel, level: level + 1, parentPath: fullPath, pattern});
      }
    }
  }

  return processedNodes;
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

