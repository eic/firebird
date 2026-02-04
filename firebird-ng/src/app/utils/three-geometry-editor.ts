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

  let mergeSubjects = [];
  // merge whole node
  if (typeof rule.patterns === "string") {
    rule.patterns = [rule.patterns];
  }

  for (const pattern of rule.patterns) {
    mergeSubjects.push(...findObject3DNodes(node, pattern, "Mesh").nodes);
  }

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
    newName = ""
  } = rule;

  let targetMeshes: Mesh[] = [];

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
      // BUT skip meshes that have already been processed (have the skip flag)
      node.traverse((child) => {
        if ((child as any)?.geometry && !isAlreadyProcessed(child)) {
          targetMeshes.push(child as Mesh);
        }
      });
    } else {
      // If patterns are given, find all meshes that match
      // Also skip already-processed meshes (e.g., outlines created by previous rules)
      if (typeof patterns === "string") {
        patterns = [patterns];
      }

      for (const pattern of patterns) {
        const found = findObject3DNodes(node, pattern, "Mesh").nodes;
        for (const mesh of found) {
          if (!isAlreadyProcessed(mesh)) {
            targetMeshes.push(mesh);
          }
        }
      }
    }
  }

  // Apply operations to each target mesh
  for (const targetMesh of targetMeshes) {

    // Change color
    if (color !== undefined && color !== null) {
      if (targetMesh.material) {
        (targetMesh.material as any).color = new Color(color);
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

    // Mark this mesh as processed so subsequent rules without patterns skip it
    markAsProcessed(targetMesh);
  }

  if (cleanupNodes) {
    pruneEmptyNodes(node);
  }
}
