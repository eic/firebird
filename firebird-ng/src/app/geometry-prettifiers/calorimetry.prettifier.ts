import * as THREE from "three";
import {
  createOutline,
  disposeNode,
  disposeOriginalMeshesAfterMerge,
  findObject3DNodes,
  pruneEmptyNodes
} from "../utils/three.utils";
import {mergeMeshList, MergeResult} from "../utils/three-geometry-merge";
import {ColorRepresentation} from "three/src/math/Color";


export class CalorimetryGeometryPrettifier {

  doEndcapEcalN(node: THREE.Mesh) {
    let crystals = findObject3DNodes(node, "**/crystal_vol_0", "Mesh").nodes;
    //console.log(crystals);

    // Merge crystals together
    let mergeResult: MergeResult = mergeMeshList(crystals, node, "crystals");
    disposeOriginalMeshesAfterMerge(mergeResult)

    // outline crystals
    createOutline(mergeResult.mergedMesh);

    // Support
    let innerSupport = findObject3DNodes(node, "**/inner_support*", "Mesh").nodes[0];
    let ring = findObject3DNodes(node, "**/ring*", "Mesh").nodes[0];

    // Ring is pretty with dark blue outline
    createOutline(ring, 0x002a42);

    const supportMaterial = new THREE.MeshStandardMaterial({
      color: 0x19a5f5,
      roughness: 0.7,
      metalness: 0.869,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide
    });

    mergeResult = mergeMeshList([innerSupport, ring], node, "support", supportMaterial);
    disposeOriginalMeshesAfterMerge(mergeResult)

    // Cleanup. Removing useless nodes that were left without geometries speeds up overall rendering
    pruneEmptyNodes(node);
  }
}
