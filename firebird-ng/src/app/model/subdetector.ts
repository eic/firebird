import {Object3D} from "three";

/**
 * Subdetector describes one of the main detectors like "TOF" or "Some Calorimeter" providing
 * convenient interface to its geometry and some additional data not solely covered by three.js geometry
 */
export interface Subdetector {

  /** If available, the original geometry component, that was used for this subdetector, like ROOT geometry or GLTF */
  sourceGeometry: any | null;

  /** If available, a name of a node/part of source geometry that is responsible for this class */
  sourceGeometryName: string;

  /** ThreeJS geometry of the subdetector */
  geometry: Object3D;

  /** Name of the detector (may differ from geometry node name) */
  name: string;

  /** The name of the detectors group. Might be in  */
  groupName: string;
}
