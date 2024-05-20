import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils";

export interface MergeResult {
  mergedGeometry: THREE.BufferGeometry;
  material: THREE.Material | undefined;
  childrenToRemove: THREE.Object3D[];
  parentNode: THREE.Object3D;
}

export class NoGeometriesFoundError extends Error {
  constructor(message: string = "No geometries found in the provided node.") {
    super(message);
    this.name = "NoGeometriesFoundError";
  }
}

export class NoMaterialError extends Error {
  constructor(message: string = "No material set or found in geometries.") {
    super(message);
    this.name = "NoMaterialError";
  }
}

/**
 * Merges all geometries in a branch of the scene graph into a single geometry.
 * @param parentNode The parent node of the branch to merge.
 * @param name  Name of the new merged geometry node
 * @param material Material to assign to the merged geometry, if empty the first material found will be used
 * @returns MergeResult object containing the merged geometry, material, children to remove, and parent node
 */
export function mergeBranchGeometries(parentNode: THREE.Object3D, name: string,  material: THREE.Material | undefined): MergeResult {
  const geometries: THREE.BufferGeometry[] = [];
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

  if (geometries.length === 0) {
    throw new NoGeometriesFoundError();
  } else if (material === undefined) {
    throw new NoMaterialError();
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
  return {
    mergedGeometry,
    material,
    childrenToRemove,
    parentNode
  };
}


/**
 * Merges all geometries from a list of meshes into a single geometry and attaches it to a new parent node.
 * @param meshes An array of THREE.Mesh objects whose geometries are to be merged.
 * @param parentNode The new parent node to which the merged mesh will be added.
 * @param name The name to assign to the merged mesh.
 *
 * (!) This function doesn't delete original meshes Compared to @see mergeBranchGeometries.
 * Use MergeResult.childrenToRemove to delete meshes that were merged
 *
 * @returns MergeResult The result of the merging process including the new parent node, merged geometry, material, and a list of original meshes.
 */
export function mergeMeshList(meshes: THREE.Mesh[], parentNode: THREE.Object3D, name: string): MergeResult {
  const geometries: THREE.BufferGeometry[] = [];
  let material: THREE.Material | undefined;

  // Collect geometries and materials from the provided meshes
  meshes.forEach(mesh => {
    if (mesh?.geometry?.isBufferGeometry) {
      mesh.updateMatrixWorld(true);
      const clonedGeometry = mesh.geometry.clone();
      clonedGeometry.applyMatrix4(mesh.matrixWorld);
      geometries.push(clonedGeometry);
      // Check if mesh.material is an array and handle it
      if (!material) { // Only set if material has not been set yet
        if (Array.isArray(mesh.material)) {
          material = mesh.material[0]; // Use the first material if it's an array
        } else {
          material = mesh.material; // Use the material directly if it's not an array
        }
      }
    }
  });

  if (geometries.length === 0) {
    throw new NoGeometriesFoundError();
  }
  if (!material) {
    throw new NoMaterialError();
  }

  // Merge all collected geometries
  const mergedGeometry = mergeGeometries(geometries, false);

  // Transform the merged geometry to the local space of the parent node
  const parentInverseMatrix = new THREE.Matrix4().copy(parentNode.matrixWorld).invert();
  mergedGeometry.applyMatrix4(parentInverseMatrix);

  // Create a new mesh with the merged geometry and the collected material
  const mergedMesh = new THREE.Mesh(mergedGeometry, material);
  mergedMesh.name = name;
  parentNode.add(mergedMesh);

  return {
    mergedGeometry,
    material,
    childrenToRemove: meshes, // Here, we assume the original meshes are what would be removed if needed
    parentNode
  };
}
