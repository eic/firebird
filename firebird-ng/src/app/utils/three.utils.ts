import outmatch from 'outmatch';

import * as THREE from "three";
import { GeoNodeWalkCallback, walkGeoNodes } from "../../lib-root-geometry/root-geo-navigation";
import { MergeResult } from "./three-geometry-merge";

/**
 * Callback function type for walking through Object3D nodes.
 *
 * @callback NodeWalkCallback
 * @param {any} node - The current node being processed.
 * @param {string} nodeFullPath - The full hierarchical path to the current node.
 * @param {number} level - The current depth level in the hierarchy.
 * @returns {boolean} - Determines whether to continue walking the tree.
 */
export type NodeWalkCallback = (node: any, nodeFullPath: string, level: number) => boolean;

/**
 * Options for walking through Object3D nodes.
 *
 * @interface NodeWalkOptions
 * @property {number} [maxLevel=Infinity] - The maximum depth level to traverse.
 * @property {number} [level=0] - The current depth level in the traversal.
 * @property {string} [parentPath=""] - The hierarchical path of the parent node.
 * @property {any} [pattern=null] - A pattern to match node paths against.
 */
interface NodeWalkOptions {
  maxLevel?: number;
  level?: number;
  parentPath?: string;
  pattern?: any;
}

/**
 * Recursively walks through a THREE.Object3D hierarchy, invoking a callback on each node.
 *
 * @function walkObject3DNodes
 * @param {any} node - The current node in the Object3D hierarchy.
 * @param {NodeWalkCallback|null} callback - The function to execute on each node.
 * @param {NodeWalkOptions} [options={}] - Configuration options for the traversal.
 * @returns {number} - The total number of nodes processed.
 */
export function walkObject3DNodes(node: any, callback: NodeWalkCallback | null, options: NodeWalkOptions = {}): number {

  // Destructure and set default values for options
  let { maxLevel = Infinity, level = 0, parentPath = "", pattern = null } = options;

  // Compile the pattern using outmatch if it's a string
  if (pattern) {
    pattern = typeof pattern === "string" ? outmatch(pattern) : pattern;
  }

  // Construct the full path of the current node
  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  let processedNodes = 1;

  // Invoke the callback if the pattern matches or if no pattern is provided
  if (!pattern || pattern(fullPath)) {
    if (callback) {
      callback(node, fullPath, level);
    }
  }

  // Continue recursion if the node has children and the maximum level hasn't been reached
  if (node?.children && level < maxLevel) {
    // Iterate backwards to safely handle node removal during traversal
    for (let i = node.children.length - 1; i >= 0; i--) {
      let child = node.children[i];
      if (child) {
        processedNodes += walkObject3DNodes(child, callback, { maxLevel, level: level + 1, parentPath: fullPath, pattern });
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
 * @function findObject3DNodes
 * @param {any} parentNode - The root node of the hierarchy to search within.
 * @param {string} pattern - A string pattern to match node names against.
 * @param {string} [matchType=""] - Optional filter to restrict results to nodes of a specific type.
 * @param {number} [maxLevel=Infinity] - The maximum depth to search within the node hierarchy.
 * @returns {FindResults} - An object containing the results of the search:
 *                          - `nodes`: Array of nodes that match the criteria.
 *                          - `fullPaths`: Array of full path strings corresponding to each matched node.
 *                          - `deepestLevel`: The deepest level reached in the hierarchy during the search.
 *                          - `totalWalked`: Total number of nodes visited during the search.
 */
export function findObject3DNodes(parentNode: any, pattern: string, matchType: string = "", maxLevel: number = Infinity): FindResults {
  let nodes: any[] = [];
  let fullPaths: string[] = [];
  let deepestLevel = 0;

  /**
   * Callback function to collect matching nodes.
   *
   * @param {any} node - The current node being processed.
   * @param {string} fullPath - The full hierarchical path to the current node.
   * @param {number} level - The current depth level in the hierarchy.
   * @returns {boolean} - Continues traversal.
   */
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

  // Execute the node walk with the collecting callback and the specified pattern
  let totalWalked = walkObject3DNodes(parentNode, collectNodes, { maxLevel, pattern });

  return {
    nodes,
    fullPaths,
    deepestLevel,
    totalWalked
  };
}

/**
 * Interface representing objects that have a color property.
 *
 * @interface Colorable
 * @property {THREE.Color} color - The color of the object.
 */
export interface Colorable {
  color: THREE.Color;
}

/**
 * Type guard function to check if the material is colorable.
 *
 * @function isColorable
 * @param {any} material - The material to check.
 * @returns {material is Colorable} - Returns true if the material has a 'color' property, false otherwise.
 */
export function isColorable(material: any): material is Colorable {
  return 'color' in material;
}

/**
 * Retrieves the color of a material if it is colorable; otherwise, returns a default color.
 *
 * @function getColorOrDefault
 * @param {any} material - The material whose color is to be retrieved.
 * @param {THREE.Color} defaultColor - The default color to return if the material is not colorable.
 * @returns {THREE.Color} - The color of the material if colorable, or the default color.
 */
export function getColorOrDefault(material: any, defaultColor: THREE.Color): THREE.Color {
  if (isColorable(material)) {
    return material.color;
  } else {
    return defaultColor;
  }
}

/**
 * Custom error class thrown when a mesh or object does not contain geometry.
 *
 * @class NoGeometryError
 * @extends {Error}
 */
class NoGeometryError extends Error {
  /**
   * The mesh or object that caused the error.
   *
   * @type {any}
   */
  mesh: any = undefined;

  /**
   * Creates an instance of NoGeometryError.
   *
   * @constructor
   * @param {any} mesh - The mesh or object that lacks geometry.
   * @param {string} [message="Mesh (or whatever is provided) does not contain geometry."] - The error message.
   */
  constructor(mesh: any, message: string = "Mesh (or whatever is provided) does not contain geometry.") {
    super(message);
    this.name = "NoGeometryError";
    this.mesh = mesh;
  }
}

/**
 * Options for creating an outline around a mesh.
 *
 * @interface CreateOutlineOptions
 * @property {THREE.ColorRepresentation} [color=0x555555] - The color of the outline.
 * @property {THREE.Material} [material] - The material to use for the outline.
 * @property {number} [thresholdAngle=40] - The angle threshold for edge detection.
 */
export interface CreateOutlineOptions {
  color?: THREE.ColorRepresentation;
  material?: THREE.Material;
  thresholdAngle?: number;
  /** If true, marks the created outline with geometryEditingSkipRules flag */
  markAsProcessed?: boolean;
}

let globalOutlineCount = 0;

/**
 * Applies an outline mesh from lines to a mesh and adds the outline to the mesh's parent.
 *
 * @function createOutline
 * @param {any} mesh - A THREE.Object3D (expected to be a Mesh) to process.
 * @param {CreateOutlineOptions} [options={}] - Configuration options for the outline.
 * @throws {NoGeometryError} - Throws an error if the mesh does not contain geometry.
 */
export function createOutline(mesh: any, options: CreateOutlineOptions = {}): void {
  if (!mesh?.geometry) {
    throw new NoGeometryError(mesh);
  }

  let { color = 0x555555, material, thresholdAngle = 40, markAsProcessed = false } = options || {};

  // Generate edges geometry based on the threshold angle
  let edges = new THREE.EdgesGeometry(mesh.geometry, thresholdAngle);
  let lineMaterial = material as THREE.LineBasicMaterial;

  // If no material is provided, create a default LineBasicMaterial
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

  // Create a LineSegments object for the outline
  const edgesLine = new THREE.LineSegments(edges, lineMaterial);
  edgesLine.name = (mesh.name ?? "") + "_outline";
  edgesLine.userData = {};

  // Mark the outline as processed so subsequent rules skip it
  if (markAsProcessed) {
    edgesLine.userData['geometryEditingSkipRules'] = true;
  }

  // Add the outline to the parent of the mesh
  mesh.updateMatrixWorld(true);
  mesh?.parent?.add(edgesLine);
  globalOutlineCount++;
  if(globalOutlineCount>0 && !(globalOutlineCount%10000)) {
    console.warn(`createOutline: Created: ${globalOutlineCount} outlines. (it is many)`);
  }
}

/**
 * Extended properties for THREE.Material to include various texture maps.
 *
 * @interface ExtendedMaterialProperties
 * @property {THREE.Texture | null} [map] - The main texture map.
 * @property {THREE.Texture | null} [lightMap] - The light map texture.
 * @property {THREE.Texture | null} [bumpMap] - The bump map texture.
 * @property {THREE.Texture | null} [normalMap] - The normal map texture.
 * @property {THREE.Texture | null} [specularMap] - The specular map texture.
 * @property {THREE.Texture | null} [envMap] - The environment map texture.
 * @property {THREE.Texture | null} [alphaMap] - The alpha map texture.
 * @property {THREE.Texture | null} [aoMap] - The ambient occlusion map texture.
 * @property {THREE.Texture | null} [displacementMap] - The displacement map texture.
 * @property {THREE.Texture | null} [emissiveMap] - The emissive map texture.
 * @property {THREE.Texture | null} [gradientMap] - The gradient map texture.
 * @property {THREE.Texture | null} [metalnessMap] - The metalness map texture.
 * @property {THREE.Texture | null} [roughnessMap] - The roughness map texture.
 */
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

/**
 * Disposes of a THREE.Material and its associated texture maps.
 *
 * @function disposeMaterial
 * @param {any} material - The material to dispose of.
 */
function disposeMaterial(material: any): void {
  const extMaterial = material as THREE.Material & ExtendedMaterialProperties;

  // Dispose of each texture map if it exists
  if (material?.map) material.map.dispose();
  if (material?.lightMap) material.lightMap.dispose();
  if (material?.bumpMap) material.bumpMap.dispose();
  if (material?.normalMap) material.normalMap.dispose();
  if (material?.specularMap) material.specularMap.dispose();
  if (material?.envMap) material.envMap.dispose();
  if (material?.alphaMap) material.alphaMap.dispose();
  if (material?.aoMap) material.aoMap.dispose();
  if (material?.displacementMap) material.displacementMap.dispose();
  if (material?.emissiveMap) material.emissiveMap.dispose();
  if (material?.gradientMap) material.gradientMap.dispose();
  if (material?.metalnessMap) material.metalnessMap.dispose();
  if (material?.roughnessMap) material.roughnessMap.dispose();

  // Dispose of the material itself
  if ('dispose' in material) {
    material.dispose();
  }
}

/**
 * Disposes of a THREE.Object3D node by disposing its geometry and materials.
 *
 * @function disposeNode
 * @param {any} node - The node to dispose of.
 */
export function disposeNode(node: any): void {
  // Dispose of geometry if it exists
  if (node?.geometry) {
    node.geometry.dispose();
  }

  // Dispose of materials if they exist
  if (node?.material) {
    if (Array.isArray(node.material)) {
      node.material.forEach(disposeMaterial);
    } else {
      disposeMaterial(node.material);
    }
  }

  // Remove the node from its parent
  node.removeFromParent();
}

/**
 * Disposes of the original meshes after merging geometries.
 *
 * @function disposeOriginalMeshesAfterMerge
 * @param {MergeResult} mergeResult - The result of the geometry merge containing nodes to remove.
 */
export function disposeOriginalMeshesAfterMerge(mergeResult: MergeResult): void {
  // Iterate through the children to remove in reverse order
  for (let i = mergeResult.childrenToRemove.length - 1; i >= 0; i--) {
    disposeNode(mergeResult.childrenToRemove[i]);
    mergeResult.childrenToRemove[i].removeFromParent();
  }
}

/**
 * Recursively disposes of a THREE.Object3D hierarchy.
 *
 * @function disposeHierarchy
 * @param {THREE.Object3D} node - The root node of the hierarchy to dispose of.
 * @param disposeSelf - disposes this node too (if false - only children and their hierarchies will be disposed)
 */
export function disposeHierarchy(node: THREE.Object3D, disposeSelf=true): void {
  // Clone the children array and iterate in reverse order
  node.children.slice().reverse().forEach(child => {
    disposeHierarchy(child);
  });

  if(disposeSelf) {
    disposeNode(node);
  }
}

/**
 * Recursively removes empty branches from a THREE.Object3D tree.
 * An empty branch is a node without geometry and without any non-empty children.
 *
 * Removing useless nodes that were left without geometries speeds up overall rendering.
 *
 * @function pruneEmptyNodes
 * @param {THREE.Object3D} node - The starting node to prune empty branches from.
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
