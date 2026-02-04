import {Color, Material, Mesh, Object3D} from "three";
import {createOutline, disposeOriginalMeshesAfterMerge, findObject3DNodes, pruneEmptyNodes} from "./three.utils";
import {mergeBranchGeometries, mergeMeshList, MergeResult} from "./three-geometry-merge";
import * as THREE from "three";
import {ColorRepresentation} from "three";
import {SimplifyModifier} from "three/examples/jsm/modifiers/SimplifyModifier.js";

/**
 * Flag name used to mark objects that have already been processed by geometry editing rules.
 * When set to true, subsequent rules without patterns ("the rest") will skip this object.
 */
export const GEOMETRY_EDITING_SKIP_FLAG = 'geometryEditingSkipRules';

/**
 * Clears the geometryEditingSkipRules flag on all nodes in the tree.
 * Should be called at the start of processing a new ruleset for a detector.
 */
export function clearGeometryEditingFlags(root: Object3D): void {
  root.traverse((child) => {
    if (child.userData && child.userData[GEOMETRY_EDITING_SKIP_FLAG] !== undefined) {
      delete child.userData[GEOMETRY_EDITING_SKIP_FLAG];
    }
  });
}

/**
 * Marks an object as processed by geometry editing rules.
 */
export function markAsProcessed(obj: Object3D): void {
  if (!obj.userData) {
    obj.userData = {};
  }
  obj.userData[GEOMETRY_EDITING_SKIP_FLAG] = true;
}

/**
 * Checks if an object has been marked as already processed.
 */
export function isAlreadyProcessed(obj: Object3D): boolean {
  return obj.userData?.[GEOMETRY_EDITING_SKIP_FLAG] === true;
}

/**
 * Checks if an object or any of its ancestors has been marked as processed.
 * This implements hierarchical skipping - if a parent branch was processed,
 * all descendants should be skipped too.
 */
export function isInProcessedBranch(obj: Object3D): boolean {
  let current: Object3D | null = obj;
  while (current) {
    if (current.userData?.[GEOMETRY_EDITING_SKIP_FLAG] === true) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export enum EditThreeNodeActions {

  Merge,   /** Merge children matching patterns (if patterns are provided) or all meshes of the node*/

}

export interface EditThreeNodeRule {

  patterns?: string[] | string;
  merge?: boolean;
  newName?: string;
  deleteOrigins?: boolean;
  cleanupNodes?: boolean;
  outline?: boolean;
  outlineThresholdAngle?: number;
  simplifyMeshes?: boolean;
  simplifyRatio?: number;

  /**
   * When true and merge=false, if a pattern matches a node, all descendant meshes
   * of that node will also be included (styled the same way).
   * Defaults to true when merge=false and patterns are provided.
   */
  applyToDescendants?: boolean;

  /** [degrees] */
  outlineColor?: ColorRepresentation;
  material?: Material;
  color?: ColorRepresentation;

}

function simplifyMeshTree(object: THREE.Object3D, simplifyRatio = 0.5): void {
  const simplifier = new SimplifyModifier();
  const minVerts = 10;

  object.traverse((child: THREE.Object3D) => {

    // Type coercions and type validations
    if (!(child as THREE.Mesh).isMesh) {
      return
    }
    const mesh = child as THREE.Mesh;

    if(!(mesh.geometry as THREE.BufferGeometry).isBufferGeometry) {
      return;
    }
    const geom = mesh.geometry as THREE.BufferGeometry;

    if (!geom.attributes['position']) {
      return;
    }

    // Do we need to convert looking at the number of vertices?
    const verticeCount  = geom.attributes['position'].count;
    const targetVerticeCount = Math.floor(verticeCount  * simplifyRatio);

    if (verticeCount < minVerts) {
      console.log(`[SimplifyMeshTree] Mesh "${mesh.name || '(unnamed)'}": skipped (too small, vertices=${verticeCount })`);
      return;
    }

    if (verticeCount < targetVerticeCount) {
      console.log(`[SimplifyMeshTree] Mesh "${mesh.name || '(unnamed)'}": skipped (too small targetVerticeCount, targetVerticeCount=${targetVerticeCount})`);
      return;
    }


    // Actual simplification
    const timeStart = performance.now();
    console.log(`[SimplifyMeshTree] Processing "${mesh.name || '(unnamed)'}": vertices before=${verticeCount}, after=${targetVerticeCount}`);

    mesh.geometry = simplifier.modify(geom, targetVerticeCount);

    // Recompute bounding limits
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeVertexNormals();

    // Make sure positions and normals will be updated
    mesh.geometry.attributes["position"]["needsUpdate"] = true;
    if (mesh.geometry.attributes["normal"]) {
      mesh.geometry.attributes["normal"]["needsUpdate"] = true;
    }

    const timeEnd = performance.now()
    if (timeEnd - timeStart > 500) {
      console.warn(`[SimplifyMeshTree] Warn: mesh "${mesh.name || '(unnamed)'}" took ${Math.round(timeEnd-timeStart)}ms to simplify.`);
    }
  });
}

function mergeWhatever(node: Object3D, rule: EditThreeNodeRule): MergeResult | undefined {

  let newName = !rule.newName ? node.name + "_merged" : rule.newName;

  if (!rule.patterns) {
    // If user provided patterns only children matching patterns (search goes over whole branch) will be merged,
    // But if no patterns given, we will merge whole node
    return mergeBranchGeometries(node, newName, rule.material);  // Children auto removed
  }

  // If we are here, we need to collect what to merge first
  // Use a Set to avoid duplicates
  const meshSet = new Set<Mesh>();

  let patterns = rule.patterns;
  if (typeof patterns === "string") {
    patterns = [patterns];
  }

  for (const pattern of patterns) {
    // Find any nodes matching the pattern (not just Meshes)
    // This allows patterns to match Groups that contain meshes
    const matchedNodes = findObject3DNodes(node, pattern, "").nodes;

    for (const matchedNode of matchedNodes) {
      // Collect all descendant meshes from each matched node
      matchedNode.traverse((child: Object3D) => {
        if ((child as Mesh).isMesh && (child as Mesh).geometry) {
          meshSet.add(child as Mesh);
        }
      });
    }
  }

  const mergeSubjects = Array.from(meshSet);
  let result = mergeMeshList(mergeSubjects, node, newName, rule.material);
  const deleteOrigins = rule?.deleteOrigins ?? true;
  if (result && deleteOrigins) {
    disposeOriginalMeshesAfterMerge(result);
  }
  return result;
}



export function editThreeNodeContent(node: Object3D, rule: EditThreeNodeRule) {
  let {
    patterns,
    deleteOrigins = true,
    cleanupNodes = true,
    outline = true,
    outlineThresholdAngle = 40,
    outlineColor,
    simplifyMeshes = false,
    simplifyRatio = 0.7,
    material,
    color,
    merge = true,
    newName = "",
    applyToDescendants
  } = rule;

  // Default applyToDescendants to true when merge=false and patterns are provided
  if (applyToDescendants === undefined) {
    applyToDescendants = !merge && !!patterns;
  }

  let targetMeshes: Mesh[] = [];
  // Track nodes to mark as processed (for hierarchical skip)
  const nodesToMarkProcessed: Object3D[] = [];

  if (merge) {
    // Existing merge logic
    let result = mergeWhatever(node, rule);
    if (!result) {
      console.warn("didn't find children to merge. Patterns:");
      console.log(patterns)
      return;
    }
    targetMeshes = [result.mergedMesh];
  } else {
    // New logic for when merge is false
    // Find all meshes that match the patterns, similar to mergeWhatever
    if (!patterns) {
      // If no patterns given, collect all meshes with geometry in the node
      // Skip meshes that are in a processed branch (hierarchical skip)
      // This means if a parent was processed, all descendants are skipped too
      node.traverse((child) => {
        if ((child as any)?.geometry && !isInProcessedBranch(child)) {
          targetMeshes.push(child as Mesh);
        }
      });
    } else {
      // If patterns are given, find all meshes/nodes that match
      if (typeof patterns === "string") {
        patterns = [patterns];
      }

      // Use a Set to avoid duplicates when multiple patterns match the same mesh
      const meshSet = new Set<Mesh>();

      for (const pattern of patterns) {
        // Find all nodes (not just meshes) matching the pattern
        const found = findObject3DNodes(node, pattern, "").nodes;

        for (const matchedNode of found) {
          // Skip if this node or any ancestor is already processed
          // This handles cases where parent and child both match the pattern
          if (isInProcessedBranch(matchedNode)) {
            continue;
          }

          // Track this node for hierarchical skip
          nodesToMarkProcessed.push(matchedNode);

          if (applyToDescendants) {
            // Collect this node and all descendant meshes
            matchedNode.traverse((child: Object3D) => {
              if ((child as any)?.geometry && !meshSet.has(child as Mesh)) {
                meshSet.add(child as Mesh);
              }
            });
          } else {
            // Only add if it's a mesh itself
            if ((matchedNode as any)?.geometry) {
              meshSet.add(matchedNode as Mesh);
            }
          }

          // Mark the matched node AFTER collecting meshes
          // This prevents child nodes from being re-processed if they also match the pattern
          markAsProcessed(matchedNode);
        }
      }
      targetMeshes = Array.from(meshSet);
    }
  }

  // Apply operations to each target mesh
  for (const targetMesh of targetMeshes) {

    // Change color
    if (color !== undefined && color !== null) {
      const mat = targetMesh.material as any;
      if (mat) {
        if (mat.color) {
          // Use setHex for more reliable color updates
          mat.color.setHex(color);
        } else {
          mat.color = new Color(color);
        }
        mat.needsUpdate = true;
      }
    }

    // Change material
    if (material !== undefined && material !== null) {
       targetMesh.material = material;
    }

    if (simplifyMeshes) {
      simplifyMeshTree(targetMesh, simplifyRatio);
    }

    if (outline) {
      createOutline(targetMesh, {color: outlineColor, thresholdAngle: outlineThresholdAngle, markAsProcessed: true});
    }

    // Mark as processed (may already be marked for pattern-based rules, but needed for merge and no-pattern cases)
    markAsProcessed(targetMesh);
  }

  if (cleanupNodes) {
    pruneEmptyNodes(node);
  }
}
