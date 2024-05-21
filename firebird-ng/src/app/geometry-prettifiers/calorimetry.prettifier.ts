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
    const supportMaterial = new THREE.MeshStandardMaterial({
      color: 0x19a5f5,
      roughness: 0.7,
      metalness: 0.869,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide
    });

    mergeResult = mergeMeshList([innerSupport, ring], node, "support", supportMaterial);
    disposeOriginalMeshesAfterMerge(mergeResult);


    // Cleanup. Removing useless nodes that were left without geometries speeds up overall rendering
    pruneEmptyNodes(node);
  }

  /**
   * DRICH
   *
   * ----------------------------------------------------
   * */
  doDRICH(node: THREE.Mesh) {

    let sensors = findObject3DNodes(node, "**/*cooling*", "Mesh").nodes;
    let aeroGel = findObject3DNodes(node, "**/*aerogel*", "Mesh").nodes[0];
    sensors.push(aeroGel);
    let mergeResult = mergeMeshList(sensors, node, "sensors");
    disposeOriginalMeshesAfterMerge(mergeResult)

    let filter = findObject3DNodes(node, "**/*filter*", "Mesh").nodes[0];
    filter.visible = false;
    let airGap = findObject3DNodes(node, "**/*airgap*", "Mesh").nodes[0];
    airGap.visible = false;


    let mirrors = findObject3DNodes(node, "**/*mirror*", "Mesh").nodes;
    const mirrorsMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xfafafa,
      roughness: 0.1,
      metalness: 0.2,
      reflectivity: 1.5,
      clearcoat: 1,
      depthTest: true,
      depthWrite: true,
      transparent: true,
      envMapIntensity: 0.8,
      opacity: 1,
      side: THREE.DoubleSide
    });

    // Merge crystals together
    mergeResult = mergeMeshList(mirrors, node, "mirrors", mirrorsMaterial);
    disposeOriginalMeshesAfterMerge(mergeResult)

    // Cleanup. Removing useless nodes that were left without geometries speeds up overall rendering
    pruneEmptyNodes(node);
  }

  /**
   * DIRC
   *
   * ----------------------------------------------------
   * */
  doDIRC(node: THREE.Mesh) {

    let bars = findObject3DNodes(node, "**/*box*", "Mesh").nodes;
    let prisms = findObject3DNodes(node, "**/*prism*", "Mesh").nodes;
    const barsPrisms = bars.concat(prisms);

    const barMat = new THREE.MeshPhysicalMaterial({
      color: 0xe5ba5d,
      metalness: .9,
      roughness: .05,
      envMapIntensity: 0.9,
      clearcoat: 1,
      transparent: true,
      //transmission: .60,
      opacity: .6,
      reflectivity: 0.2,
      //refr: 0.985,
      ior: 0.9,
      side: THREE.DoubleSide,
    });


    let mergeResult = mergeMeshList(barsPrisms, node, "barsPrisms", barMat);
    disposeOriginalMeshesAfterMerge(mergeResult);

    createOutline(mergeResult.mergedMesh);

    // Rails
    let rails = findObject3DNodes(node, "**/*rail*", "Mesh").nodes;
    mergeResult = mergeMeshList(rails, node, "rails");
    disposeOriginalMeshesAfterMerge(mergeResult);
    createOutline(mergeResult.mergedMesh);

    // MCPs
    let mcps = findObject3DNodes(node, "**/*mcp*", "Mesh").nodes;
    mergeResult = mergeMeshList(mcps, node, "mcps");
    disposeOriginalMeshesAfterMerge(mergeResult);

    // Cleanup. Removing useless nodes that were left without geometries speeds up overall rendering
    pruneEmptyNodes(node);
  }
}
