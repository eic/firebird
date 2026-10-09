/**
 * The ROOT geometry worker: `runGeometryWorker(self)` in a worker entry
 * module of the application (see `withWorkers()`).
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

// jsroot declares its subpath modules (jsroot/io, jsroot/geom) in the types
// of its main entry; the reference loads them without importing the main
// entry, whose module graph is several times the size of the io entry.
/// <reference types="jsroot" />
import {openFile} from 'jsroot/io';
import {build} from 'jsroot/geom';
import {
  analyzeGeoNodes,
  findGeoManager,
} from '@dexvis/root-geo-tree-editor';
import {applyDetectorEditRules, pruneTopLevelDetectors} from './root-geometry.processor';
import type {RootGeometryLoadRules} from '@dexvis/firebird-ng/api';
import type {WorkerScope} from '@dexvis/firebird-ng/api';

// Message types for communication with main thread
export interface GeometryLoadRequest {
  type: 'load';
  requestId: string;
  /**
   * Where to read the geometry from: a URL, or a file the user picked or
   * dropped. A File is structured-cloneable, so it crosses to the worker
   * without being read - jsroot slices it the same way it byte-ranges a URL.
   */
  url: string | File;
  /**
   * What to prune and edit before the build, as plain data: this worker is
   * a prebuilt module and cannot import the packs that define the rules.
   */
  rules: RootGeometryLoadRules;
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

// Track active requests for cancellation
let activeRequestId: string | null = null;
let cancellationRequested = false;
let isProcessing = false;  // Prevents concurrent processing

function stripIdFromName(name: string): string {
  return name.replace(/_\d+$/, '');
}

function sendProgress(post: (message: WorkerResponse) => void, requestId: string, stage: string, progress: number) {
  const response: GeometryLoadProgress = {
    type: 'progress',
    requestId,
    stage,
    progress
  };
  post(response);
}

async function loadGeometry(request: GeometryLoadRequest, post: (message: WorkerResponse) => void): Promise<void> {
  const {requestId, url, rules} = request;

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

    sendProgress(post, requestId, 'Opening ROOT file', 10);

    console.time('[GeometryWorker]: Open root file');
    const file = await openFile(url);
    console.timeEnd('[GeometryWorker]: Open root file');

    checkCancellation();
    sendProgress(post, requestId, 'Reading geometry', 20);

    console.time('[GeometryWorker]: Reading geometry from file');
    const rootGeometry = await findGeoManager(file);
    console.timeEnd('[GeometryWorker]: Reading geometry from file');

    if (!rootGeometry) {
      throw new Error('No TGeoManager found in ROOT file');
    }

    checkCancellation();
    sendProgress(post, requestId, 'Pruning geometry', 30);

    // Remove the top-level detectors of the selected cut list
    if (rules.cutList.length > 0) {
      const result = pruneTopLevelDetectors(rootGeometry, rules.cutList);
      console.log(`[GeometryWorker]: Pruned geometry. Nodes left: ${result.nodes.length}, Removed: ${result.removedNodes.length}`);
    }

    checkCancellation();
    sendProgress(post, requestId, 'Pre-processing geometry', 40);

    // Apply the selected detector edit rules
    if (rules.editRules.length > 0) {
      console.time('[GeometryWorker]: Root geometry pre-processing');
      applyDetectorEditRules(rootGeometry, rules.editRules);
      console.timeEnd('[GeometryWorker]: Root geometry pre-processing');
    }

    checkCancellation();
    sendProgress(post, requestId, 'Analyzing geometry', 50);

    console.log("[GeometryWorker]: Number of tree elements analysis (after root geometry prune):");
    analyzeGeoNodes(rootGeometry, 1);

    checkCancellation();
    sendProgress(post, requestId, 'Building 3D geometry', 60);

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

    sendProgress(post, requestId, 'Extracting subdetector info', 80);

    // Extract subdetector information
    const topDetectorNodes = geometry.children[0].children;

    const subdetectorInfos: SubdetectorInfo[] = topDetectorNodes.map((topNode: any) => ({
      name: stripIdFromName(topNode.name),
      originalName: topNode.name,
    }));

    checkCancellation();
    sendProgress(post, requestId, 'Serializing geometry', 90);

    // Serialize the geometry to JSON for transfer
    console.time('[GeometryWorker]: Serialize geometry to JSON');
    const geometryJson = geometry.toJSON();
    console.timeEnd('[GeometryWorker]: Serialize geometry to JSON');

    sendProgress(post, requestId, 'Complete', 100);

    const response: GeometryLoadSuccess = {
      type: 'success',
      requestId,
      geometryJson,
      subdetectorInfos
    };

    post(response);

  } catch (error: any) {
    if (error.message === 'CANCELLED') {
      const response: GeometryLoadCancelled = {
        type: 'cancelled',
        requestId
      };
      post(response);
    } else {
      console.error('[GeometryWorker]: Error loading geometry:', error);
      const response: GeometryLoadError = {
        type: 'error',
        requestId,
        error: error.message || String(error)
      };
      post(response);
    }
  } finally {
    activeRequestId = null;
    cancellationRequested = false;
    isProcessing = false;
  }
}

/**
 * Runs the geometry worker in `scope`, the global scope of a worker entry
 * module (`self`): answers the load and cancel requests of GeometryService.
 *
 * ```ts
 * // geometry.worker.ts, the module withWorkers({ geometry }) starts
 * import { runGeometryWorker } from '@dexvis/firebird-ng/workers/geometry';
 * runGeometryWorker(self);
 * ```
 */
export function runGeometryWorker(scope: WorkerScope): void {
  const post = (message: WorkerResponse) => scope.postMessage(message);
  scope.addEventListener('message', ({data}: MessageEvent<WorkerRequest>) => {
    if (data.type === 'load') {
      void loadGeometry(data, post);
    } else if (data.type === 'cancel') {
      if (activeRequestId === data.requestId) {
        console.log(`[GeometryWorker]: Cancellation requested for ${data.requestId}`);
        cancellationRequested = true;
      }
    }
  });
}
