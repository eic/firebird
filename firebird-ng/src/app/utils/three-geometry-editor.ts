import {Color, Material, Mesh, Object3D} from "three";
import {createOutline, disposeOriginalMeshesAfterMerge, findObject3DNodes, pruneEmptyNodes} from "./three.utils";
import {mergeBranchGeometries, mergeMeshList, MergeResult} from "./three-geometry-merge";
import * as THREE from "three";
import {ColorRepresentation} from "three/src/math/Color";
import {SimplifyModifier} from "three/examples/jsm/modifiers/SimplifyModifier.js";

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
      createOutline(targetMesh, {color: outlineColor, thresholdAngle: outlineThresholdAngle});
    }
  }

  if (cleanupNodes) {
    pruneEmptyNodes(node);
  }
}
