/// <reference lib="webworker" />

/**
 * Web Worker for loading and processing ROOT geometry files.
 *
 * This worker performs heavy geometry loading operations off the main thread:
 * - Fetches ROOT files via jsroot
 * - Parses TGeoManager
 * - Prunes and processes geometry
 * - Builds Three.js geometry
 * - Serializes the result for transfer to main thread
 *
 * Supports cancellation via requestId tracking.
 */

import {openFile} from 'jsroot';
import {build} from 'jsroot/geom';
import {
  analyzeGeoNodes,
  findGeoManager,
  getGeoNodesByLevel
} from '../../lib-root-geometry/root-geo-navigation';
import {pruneTopLevelDetectors, RootGeometryProcessor} from '../data-pipelines/root-geometry.processor';

// Message types for communication with main thread
export interface GeometryLoadRequest {
  type: 'load';
  requestId: string;
  url: string;
  options: GeometryLoadOptions;
}

export interface GeometryLoadOptions {
  cutListName: string;       // "central" or other - controls pruning
  rootFilterName: string;    // "default" or other - controls pre-processing
}

export interface GeometryCancelRequest {
  type: 'cancel';
  requestId: string;
}

export type WorkerRequest = GeometryLoadRequest | GeometryCancelRequest;

export interface GeometryLoadSuccess {
  type: 'success';
  requestId: string;
  geometryJson: any;           // Serialized Object3D via toJSON()
  subdetectorInfos: SubdetectorInfo[];  // Metadata about subdetectors
}

export interface SubdetectorInfo {
  name: string;
  originalName: string;
  groupName: string;
}

export interface GeometryLoadError {
  type: 'error';
  requestId: string;
  error: string;
}

export interface GeometryLoadCancelled {
  type: 'cancelled';
  requestId: string;
}

export interface GeometryLoadProgress {
  type: 'progress';
  requestId: string;
  stage: string;
  progress: number;  // 0-100
}

export type WorkerResponse = GeometryLoadSuccess | GeometryLoadError | GeometryLoadCancelled | GeometryLoadProgress;

// Detectors to remove when cutListName is "central"
const removeDetectorNames: string[] = [
  "Lumi",
  "B1",
  "B2",
  "Q2",
  "ForwardOffM",
  "Forward",
  "Backward",
  "Vacuum",
  "SweeperMag",
  "AnalyzerMag",
  "ZDC",
  "HcalFarForward",
  "InnerTrackingSupport"
];

// Map detector names to groups (same as in geometry.service.ts)
const groupsByDetName = new Map<string, string>([
  ["SolenoidBarrel_assembly_0", "Magnets"],
  ["SolenoidEndcapP_1", "Magnets"],
  ["SolenoidEndcapN_2", "Magnets"],
  ["VertexBarrelSubAssembly_3", "Tracking"],
  ["InnerSiTrackerSubAssembly_4", "Tracking"],
  ["MiddleSiTrackerSubAssembly_5", "Tracking"],
  ["OuterSiTrackerSubAssembly_6", "Tracking"],
  ["EndcapMPGDSubAssembly_7", "Tracking"],
  ["InnerMPGDBarrelSubAssembly_8", "Tracking"],
  ["EndcapTOFSubAssembly_9", "PID"],
  ["BarrelTOFSubAssembly_10", "PID"],
  ["OuterBarrelMPGDSubAssembly_11", "Tracking"],
  ["B0TrackerSubAssembly_12", "Tracking"],
  ["InnerTrackerSupport_assembly_13", "Beam pipe and support"],
  ["DIRC_14", "PID"],
  ["RICHEndcapN_Vol_15", "PID"],
  ["DRICH_16", "PID"],
  ["EcalEndcapP_17", "Calorimeters"],
  ["EcalEndcapPInsert_18", "Calorimeters"],
  ["EcalBarrelImaging_19", "Calorimeters"],
  ["EcalBarrelScFi_20", "Calorimeters"],
  ["EcalEndcapN_21", "Calorimeters"],
  ["LFHCAL_env_22", "Calorimeters"],
  ["HcalEndcapPInsert_23", "Calorimeters"],
  ["HcalBarrel_24", "Calorimeters"],
  ["FluxBarrel_env_25", "Beam pipe and support"],
  ["FluxEndcapP_26", "Beam pipe and support"],
  ["HcalEndcapN_27", "Calorimeters"],
  ["FluxEndcapN_28", "Beam pipe and support"],
  ["BeamPipe_assembly_29", "Beam pipe and support"],
  ["B0PF_BeamlineMagnet_assembly_30", "Magnets"],
  ["B0APF_BeamlineMagnet_assembly_31", "Magnets"],
  ["Q1APF_BeamlineMagnet_assembly_32", "Magnets"],
  ["Q1BPF_BeamlineMagnet_assembly_33", "Magnets"],
  ["BeamPipeB0_assembly_38", "Beam pipe and support"],
  ["Pipe_cen_to_pos_assembly_39", "Beam pipe and support"],
  ["Q0EF_assembly_40", "Magnets"],
  ["Q0EF_vac_41", "Magnets"],
  ["Q1EF_assembly_42", "Magnets"],
  ["Q1EF_vac_43", "Magnets"],
  ["B0ECal_44", "Calorimeters"],
  ["Pipe_Q1eR_to_B2BeR_assembly_54", "Beam pipe and support"],
  ["Magnet_Q1eR_assembly_55", "Magnets"],
  ["Magnet_Q2eR_assembly_56", "Magnets"],
  ["Magnet_B2AeR_assembly_57", "Magnets"],
  ["Magnet_B2BeR_assembly_58", "Magnets"],
  ["Magnets_Q3eR_assembly_59", "Magnets"],
]);

// Track active requests for cancellation
let activeRequestId: string | null = null;
let cancellationRequested = false;
let isProcessing = false;  // Prevents concurrent processing

const rootGeometryProcessor = new RootGeometryProcessor();

function stripIdFromName(name: string): string {
  return name.replace(/_\d+$/, '');
}

function sendProgress(requestId: string, stage: string, progress: number) {
  const response: GeometryLoadProgress = {
    type: 'progress',
    requestId,
    stage,
    progress
  };
  postMessage(response);
}

async function loadGeometry(request: GeometryLoadRequest): Promise<void> {
  const {requestId, url, options} = request;

  // If already processing, mark for cancellation and wait for it to finish
  if (isProcessing) {
    console.log(`[GeometryWorker]: Already processing ${activeRequestId}, marking for cancellation`);
    cancellationRequested = true;

    // Wait for current processing to finish before starting new one
    while (isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  isProcessing = true;
  activeRequestId = requestId;
  cancellationRequested = false;

  try {
    // Check for cancellation at key points
    const checkCancellation = () => {
      if (cancellationRequested) {
        throw new Error('CANCELLED');
      }
    };

    sendProgress(requestId, 'Opening ROOT file', 10);

    console.time('[GeometryWorker]: Open root file');
    const file = await openFile(url);
    console.timeEnd('[GeometryWorker]: Open root file');

    checkCancellation();
    sendProgress(requestId, 'Reading geometry', 20);

    console.time('[GeometryWorker]: Reading geometry from file');
    const rootGeometry = await findGeoManager(file);
    console.timeEnd('[GeometryWorker]: Reading geometry from file');

    if (!rootGeometry) {
      throw new Error('No TGeoManager found in ROOT file');
    }

    checkCancellation();
    sendProgress(requestId, 'Pruning geometry', 30);

    // Prune top-level detectors if configured
    if (options.cutListName === "central") {
      const result = pruneTopLevelDetectors(rootGeometry, removeDetectorNames);
      console.log(`[GeometryWorker]: Pruned geometry. Nodes left: ${result.nodes.length}, Removed: ${result.removedNodes.length}`);
    }

    checkCancellation();
    sendProgress(requestId, 'Pre-processing geometry', 40);

    // Apply ROOT geometry processing
    if (options.rootFilterName === "default") {
      console.time('[GeometryWorker]: Root geometry pre-processing');
      rootGeometryProcessor.process(rootGeometry);
      console.timeEnd('[GeometryWorker]: Root geometry pre-processing');
    }

    checkCancellation();
    sendProgress(requestId, 'Analyzing geometry', 50);

    console.log("[GeometryWorker]: Number of tree elements analysis (after root geometry prune):");
    analyzeGeoNodes(rootGeometry, 1);

    checkCancellation();
    sendProgress(requestId, 'Building 3D geometry', 60);

    // Build Three.js geometry - this is the most expensive operation
    console.time('[GeometryWorker]: Build geometry');
    const geometry = build(rootGeometry, {
      numfaces: 5000000000,
      numnodes: 5000000000,
      instancing: -1,
      dflt_colors: false,
      vislevel: 200,
      doubleside: true,
      transparency: true
    });
    console.timeEnd('[GeometryWorker]: Build geometry');

    checkCancellation();

    // Validate the geometry
    if (!geometry) {
      throw new Error("Geometry is null or undefined after build");
    }

    if (!geometry.children.length) {
      throw new Error("Geometry is converted but empty. Expected 'world_volume' but got nothing");
    }

    if (!geometry.children[0].children.length) {
      throw new Error("Geometry is converted but empty. Expected array of top level nodes but got nothing");
    }

    sendProgress(requestId, 'Extracting subdetector info', 80);

    // Extract subdetector information
    const topDetectorNodes = geometry.children[0].children;
    const rootGeoNodes = getGeoNodesByLevel(rootGeometry, 1).map((obj: any) => obj.geoNode);

    const subdetectorInfos: SubdetectorInfo[] = [];
    for (const topNode of topDetectorNodes) {
      const originalName = topNode.name;
      const name = stripIdFromName(originalName);
      const groupName = groupsByDetName.get(originalName) || "";

      subdetectorInfos.push({
        name,
        originalName,
        groupName
      });
    }

    checkCancellation();
    sendProgress(requestId, 'Serializing geometry', 90);

    // Serialize the geometry to JSON for transfer
    console.time('[GeometryWorker]: Serialize geometry to JSON');
    const geometryJson = geometry.toJSON();
    console.timeEnd('[GeometryWorker]: Serialize geometry to JSON');

    sendProgress(requestId, 'Complete', 100);

    const response: GeometryLoadSuccess = {
      type: 'success',
      requestId,
      geometryJson,
      subdetectorInfos
    };

    postMessage(response);

  } catch (error: any) {
    if (error.message === 'CANCELLED') {
      const response: GeometryLoadCancelled = {
        type: 'cancelled',
        requestId
      };
      postMessage(response);
    } else {
      console.error('[GeometryWorker]: Error loading geometry:', error);
      const response: GeometryLoadError = {
        type: 'error',
        requestId,
        error: error.message || String(error)
      };
      postMessage(response);
    }
  } finally {
    activeRequestId = null;
    cancellationRequested = false;
    isProcessing = false;
  }
}

// Handle messages from main thread
addEventListener('message', ({data}: MessageEvent<WorkerRequest>) => {
  if (data.type === 'load') {
    loadGeometry(data);
  } else if (data.type === 'cancel') {
    if (activeRequestId === data.requestId) {
      console.log(`[GeometryWorker]: Cancellation requested for ${data.requestId}`);
      cancellationRequested = true;
    }
  }
});
