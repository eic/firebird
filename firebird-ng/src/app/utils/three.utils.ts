import outmatch from 'outmatch';

import * as THREE from "three";
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';
import {GeoNodeWalkCallback, walkGeoNodes} from "../../lib-root-geometry/root-geo-navigation";
import {MergeResult} from "./three-geometry-merge";

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

/**
 * Represents the results of a node searching operation within a THREE.Object3D hierarchy.
 *
 * @interface FindResults
 * @property {any[]} nodes - An array of nodes that matched the search criteria. These nodes are part of the THREE.Object3D hierarchy.
 * @property {string[]} fullPaths - An array of strings, each representing the full path to a corresponding node in the `nodes` array. The full path is constructed by concatenating parent node names, providing a clear hierarchical structure.
  * @property {number} deepestLevel - The deepest level reached in the hierarchy during the search. This value helps understand the depth of the search and which level had the last matched node.
 * @property {number} totalWalked - The total number of nodes visited during the search process. This count includes all nodes checked, regardless of whether they matched the criteria.
 */
export interface FindResults {
  nodes: any[];
  fullPaths: string[];
  deepestLevel: number;
  totalWalked: number;
}

/**
 * Searches for and collects nodes in a THREE.Object3D hierarchy based on a given pattern and type.
 *
 * @param parentNode The root node of the hierarchy to search within.
 * @param pattern A string pattern to match node names against.
 * @param matchType Optional filter to restrict results to nodes of a specific type.
 * @param maxLevel Maximum depth to search within the node hierarchy.
 * @returns FindResults Object containing the results of the search:
 *                      - nodes: Array of nodes that match the criteria.
 *                      - fullPaths: Array of full path strings corresponding to each matched node.
 *                      - matches: Total number of nodes that matched the search criteria.
 *                      - deepestLevel: The deepest level reached in the hierarchy during the search.
 *                      - totalWalked: Total number of nodes visited during the search.
 */
export function findObject3DNodes(parentNode: any, pattern: string, matchType: string = "", maxLevel: number = Infinity): FindResults {
  let nodes: any[] = [];
  let fullPaths: string[] = [];
  let deepestLevel = 0;

  // Define a callback using the NodeWalkCallback type
  const collectNodes: NodeWalkCallback = (node, fullPath, level) => {
    if (!matchType || matchType === node.type) {
      nodes.push(node);
      fullPaths.push(fullPath);
      if (level > deepestLevel) {
        deepestLevel = level;
      }
    }
    return true; // Continue traversal
  };

  // Use walkObject3DNodes with the collecting callback and the pattern
  let totalWalked = walkObject3DNodes(parentNode, collectNodes, { maxLevel, pattern });

  return {
    nodes,
    fullPaths,
    deepestLevel,
    totalWalked
  };
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


/** Throws an error if the mesh/object does not contain geometry. */
class NoGeometryError extends Error {
  mesh = undefined;
  constructor(mesh: any, message: string = "Mesh (or whatever is provided) does not contain geometry.") {
    super(message);
    this.name = "InvalidMeshError";
    this.mesh = mesh;
  }
}

export interface CreateOutlineOptions {
  color?: THREE.ColorRepresentation;
  material?: THREE.Material;
  thresholdAngle?: number;
}

/**
 * Applies an outline mesh from lines to a mesh and adds the outline to the mesh's parent.
 * @param mesh A THREE.Object3D (expected to be a Mesh) to process.
 * @param options
 */
export function createOutline(mesh: any, options: CreateOutlineOptions = {}): void {
  if (!mesh?.geometry) {
    throw new NoGeometryError(mesh);
  }

  let { color = 0x555555, material, thresholdAngle = 40 } = options || {};

  let edges = new THREE.EdgesGeometry(mesh.geometry, thresholdAngle);
  let lineMaterial = material as THREE.LineBasicMaterial;

  if (!lineMaterial) {
    lineMaterial = new THREE.LineBasicMaterial({
      color: color ?? new THREE.Color(0x555555),
      fog: false,
      clippingPlanes: mesh.material?.clippingPlanes ? mesh.material.clippingPlanes : [],
      clipIntersection: false,
      clipShadows: true,
      transparent: true
    });
  }

  // Create a mesh with the outline
  const edgesLine = new THREE.LineSegments(edges, lineMaterial);
  edgesLine.name = (mesh.name ?? "") + "_outline";
  edgesLine.userData = {};

  // Add to parent
  mesh.updateMatrixWorld(true);
  mesh?.parent?.add(edgesLine);
}


type ExtendedMaterialProperties = {
  map?: THREE.Texture | null,
  lightMap?: THREE.Texture | null,
  bumpMap?: THREE.Texture | null,
  normalMap?: THREE.Texture | null,
  specularMap?: THREE.Texture | null,
  envMap?: THREE.Texture | null,
  alphaMap?: THREE.Texture | null,
  aoMap?: THREE.Texture | null,
  displacementMap?: THREE.Texture | null,
  emissiveMap?: THREE.Texture | null,
  gradientMap?: THREE.Texture | null,
  metalnessMap?: THREE.Texture | null,
  roughnessMap?: THREE.Texture | null,
};

function disposeMaterial(material: any): void {
  const extMaterial = material as THREE.Material & ExtendedMaterialProperties;

  if (material?.map)               material.map.dispose ();
  if (material?.lightMap)          material.lightMap.dispose ();
  if (material?.bumpMap)           material.bumpMap.dispose ();
  if (material?.normalMap)         material.normalMap.dispose ();
  if (material?.specularMap)       material.specularMap.dispose ();
  if (material?.envMap)            material.envMap.dispose ();
  if (material?.alphaMap)          material.alphaMap.dispose();
  if (material?.aoMap)             material.aoMap.dispose();
  if (material?.displacementMap)   material.displacementMap.dispose();
  if (material?.emissiveMap)       material.emissiveMap.dispose();
  if (material?.gradientMap)       material.gradientMap.dispose();
  if (material?.metalnessMap)      material.metalnessMap.dispose();
  if (material?.roughnessMap)      material.roughnessMap.dispose();

  if ('dispose' in material) {
    material.dispose(); // Dispose the material itself
  }
}

export function disposeNode(node: any): void {
    // Dispose geometry
    if (node?.geometry) {
      node.geometry.dispose();
    }

    // Dispose materials
    if (node?.material) {
      if (Array.isArray(node.material)) {
        node.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(node.material);
      }
    }

  node.removeFromParent();
}

export function disposeOriginalMeshesAfterMerge(mergeResult: MergeResult) {
  // Remove initial nodes
  for (let i=mergeResult.childrenToRemove.length-1; i>=0; i-- ) {
    disposeNode(mergeResult.childrenToRemove[i]);
    mergeResult.childrenToRemove[i].removeFromParent();
  }
}

export function disposeHierarchy(node: THREE.Object3D): void {
  node.children.slice().reverse().forEach(child => {
    disposeHierarchy(child);
  });
  disposeNode(node);
}

/**
 * Recursively removes empty branches from a THREE.Object3D tree.
 * An empty branch is a node without geometry and without any non-empty children.
 * @param node - The starting node to prune empty branches from.
 *
 * Removing useless nodes that were left without geometries speeds up overall rendering
 *
 */
export function pruneEmptyNodes(node: THREE.Object3D): void {
  // Traverse children from last to first to avoid index shifting issues after removal
  for (let i = node.children.length - 1; i >= 0; i--) {
    pruneEmptyNodes(node.children[i]); // Recursively prune children first
  }

  // After pruning children, determine if the current node is now empty
  if (node.children.length === 0 && !((node as any)?.geometry)) {
    node.removeFromParent();
  }
}


