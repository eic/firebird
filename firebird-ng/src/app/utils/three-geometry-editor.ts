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
  newName?:string;
  deleteOrigins?:boolean;
  cleanupNodes?:boolean;
  outline?:boolean;
  outlineThresholdAngle?:number;  /** [degrees] */
  outlineColor?:ColorRepresentation;
  material?: Material;
  color?: ColorRepresentation;

}

function mergeWhatever(node: Object3D, rule: EditThreeNodeRule): MergeResult| undefined {

  let newName = !rule.newName? node.name + "_merged" : rule.newName;

  if(!rule.patterns) {
    // If user provided patterns only children matching patterns (search goes over whole branch) will be merged,
    // But if no patterns given, we will merge whole node
    return mergeBranchGeometries(node, newName, rule.material);  // Children auto removed
  }

  // If we are here, we need to collect what to merge first

  let mergeSubjects = [];
  // merge whole node
  if(typeof rule.patterns === "string") {
    rule.patterns = [rule.patterns];
  }

  for(const pattern of rule.patterns) {
    mergeSubjects.push(...findObject3DNodes(node, pattern, "Mesh").nodes);
  }

  let result = mergeMeshList(mergeSubjects, node, newName, rule.material);
  if(result && rule.deleteOrigins) {
    disposeOriginalMeshesAfterMerge(result);
  }
  return result;
}

export function editThreeNodeContent(node: Object3D, rule: EditThreeNodeRule) {

  let {patterns, deleteOrigins = true, cleanupNodes=true, outline = true, outlineThresholdAngle = 40, outlineColor, material, color, merge=true, newName=""} = rule;

  let targetMesh: Mesh;

  if(merge) {
    let result = mergeWhatever(node, rule);
    if(!result) {
      console.warn("didn't find children to merge. Patterns:");
      console.log(patterns)
      return;
    }
    targetMesh = result.mergedMesh;
  }
  else {
    targetMesh = node as Mesh;
  }

  if(color !== "undefined") {
    if(targetMesh.material) {
      (targetMesh.material as any).color =  new Color(color);
    }
  }

  if(outline) {
    createOutline(targetMesh, {color: outlineColor, thresholdAngle: outlineThresholdAngle});
  }

  if(targetMesh && cleanupNodes) {
    pruneEmptyNodes(node);
  }
}
