import {Color, Material, Mesh, Object3D} from "three";
import {createOutline, disposeOriginalMeshesAfterMerge, findObject3DNodes, pruneEmptyNodes} from "./three.utils";
import {mergeBranchGeometries, mergeMeshList, MergeResult} from "./three-geometry-merge";
import * as THREE from "three";
import {ColorRepresentation} from "three/src/math/Color";

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
  /** [degrees] */
  outlineColor?: ColorRepresentation;
  material?: Material;
  color?: ColorRepresentation;

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
      node.traverse((child) => {
        if ((child as any)?.geometry) {
          targetMeshes.push(child as Mesh);
        }
      });
    } else {
      // If patterns are given, find all meshes that match
      if (typeof patterns === "string") {
        patterns = [patterns];
      }

      for (const pattern of patterns) {
        targetMeshes.push(...findObject3DNodes(node, pattern, "Mesh").nodes);
      }
    }
  }

  // Apply operations to each target mesh
  for (const targetMesh of targetMeshes) {
    if (color !== undefined && color !== null) {
      if (targetMesh.material) {
        (targetMesh.material as any).color = new Color(color);
      }
    }

    if (outline) {
      createOutline(targetMesh, {color: outlineColor, thresholdAngle: outlineThresholdAngle});
    }
  }

  if (cleanupNodes) {
    pruneEmptyNodes(node);
  }
}
