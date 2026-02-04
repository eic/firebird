import {Injectable, signal, WritableSignal} from '@angular/core';
import {ConfigService} from "./config.service";
import {Subdetector} from "../model/subdetector";
import {Color, DoubleSide, MeshLambertMaterial, NormalBlending, Object3D, ObjectLoader, Plane} from "three";
import {UrlService} from "./url.service";
import {DetectorThreeRuleSet, ThreeGeometryProcessor} from "../data-pipelines/three-geometry.processor";
import * as THREE from "three";
import {getColorOrDefault} from "../utils/three.utils";

import {cool2ColorRules} from "../theme/cool2-geometry-ruleset";
import {cadColorRules} from "../theme/cad-geometry-ruleset";
import {monoColorRules} from "../theme/mono-geometry-ruleset";
import {cool2NoOutlineColorRules} from "../theme/cool2no-geometry-ruleset";

import {ConfigProperty} from "../utils/config-property";
import {prettify, PrettifyOptions} from "../utils/eic-geometry-prettifier";

import type {
  WorkerRequest,
  WorkerResponse,
  GeometryLoadRequest,
  GeometryCancelRequest,
  SubdetectorInfo
} from "../workers/geometry-loader.worker";

export const GROUP_CALORIMETRY = "Calorimeters";
export const GROUP_TRACKING = "Tracking";
export const GROUP_PID = "PID";
export const GROUP_MAGNETS = "Magnets";
export const GROUP_SUPPORT = "Beam pipe and support";
export const ALL_GROUPS = [
  GROUP_CALORIMETRY,
  GROUP_TRACKING,
  GROUP_PID,
  GROUP_MAGNETS,
  GROUP_SUPPORT,
]



// constants.ts
export const DEFAULT_GEOMETRY = 'builtin://epic-central-optimized';

/** Result returned by loadGeometry */
export interface GeometryLoadResult {
  threeGeometry: Object3D | null;
  cancelled: boolean;
}

/** Progress callback type */
export type GeometryProgressCallback = (stage: string, progress: number) => void;

@Injectable({
  providedIn: 'root'
})
export class GeometryService {

  geometryFastAndUgly = new ConfigProperty('geometry.FastDefaultMaterial', false);
  geometryCutListName = new ConfigProperty('geometry.cutListName', "off");
  geometryThemeName = new ConfigProperty('geometry.themeName', "cool2");
  geometryRootFilterName = new ConfigProperty('geometry.rootFilterName', "default");

  /** Collection of subdetectors */
  public subdetectors: Subdetector[] = [];

  /** TGeoManager - no longer available when using worker (kept for API compatibility) */
  public rootGeometry: any | null = null;

  public groupsByDetName: Map<string, string>;

  /** for geometry post-processing */
  private threeGeometryProcessor = new ThreeGeometryProcessor();

  private defaultColor: Color = new Color(0x68698D);

  public geometry: WritableSignal<Object3D | null> = signal(null);

  /** Loading progress signal (0-100) */
  public loadingProgress: WritableSignal<number> = signal(0);

  /** Current loading stage description */
  public loadingStage: WritableSignal<string> = signal('');

  /** Worker instance for geometry loading */
  private worker: Worker | null = null;

  /** Current active request ID */
  private currentRequestId: string | null = null;

  /** Pending promise resolvers for geometry loading */
  private pendingResolvers: Map<string, {
    resolve: (result: GeometryLoadResult) => void;
    reject: (error: Error) => void;
    onProgress?: GeometryProgressCallback;
  }> = new Map();

  /** ObjectLoader for deserializing geometry from worker */
  private objectLoader = new ObjectLoader();

  constructor(
    private urlService: UrlService,
    private config: ConfigService,
  ) {
    this.groupsByDetName = new Map<string, string>([
      ["SolenoidBarrel_assembly_0", GROUP_MAGNETS],
      ["SolenoidEndcapP_1", GROUP_MAGNETS],
      ["SolenoidEndcapN_2", GROUP_MAGNETS],
      ["VertexBarrelSubAssembly_3", GROUP_TRACKING],
      ["InnerSiTrackerSubAssembly_4", GROUP_TRACKING],
      ["MiddleSiTrackerSubAssembly_5", GROUP_TRACKING],
      ["OuterSiTrackerSubAssembly_6", GROUP_TRACKING],
      ["EndcapMPGDSubAssembly_7", GROUP_TRACKING],
      ["InnerMPGDBarrelSubAssembly_8", GROUP_TRACKING],
      ["EndcapTOFSubAssembly_9", GROUP_PID],
      ["BarrelTOFSubAssembly_10", GROUP_PID],
      ["OuterBarrelMPGDSubAssembly_11", GROUP_TRACKING],
      ["B0TrackerSubAssembly_12", GROUP_TRACKING],
      ["InnerTrackerSupport_assembly_13", GROUP_SUPPORT],
      ["DIRC_14", GROUP_PID],
      ["RICHEndcapN_Vol_15", GROUP_PID],
      ["DRICH_16", GROUP_PID],
      ["EcalEndcapP_17", GROUP_CALORIMETRY],
      ["EcalEndcapPInsert_18", GROUP_CALORIMETRY],
      ["EcalBarrelImaging_19", GROUP_CALORIMETRY],
      ["EcalBarrelScFi_20", GROUP_CALORIMETRY],
      ["EcalEndcapN_21", GROUP_CALORIMETRY],
      ["LFHCAL_env_22", GROUP_CALORIMETRY],
      ["HcalEndcapPInsert_23", GROUP_CALORIMETRY],
      ["HcalBarrel_24", GROUP_CALORIMETRY],
      ["FluxBarrel_env_25", GROUP_SUPPORT],
      ["FluxEndcapP_26", GROUP_SUPPORT],
      ["HcalEndcapN_27", GROUP_CALORIMETRY],
      ["FluxEndcapN_28", GROUP_SUPPORT],
      ["BeamPipe_assembly_29", GROUP_SUPPORT],
      ["B0PF_BeamlineMagnet_assembly_30", GROUP_MAGNETS],
      ["B0APF_BeamlineMagnet_assembly_31", GROUP_MAGNETS],
      ["Q1APF_BeamlineMagnet_assembly_32", GROUP_MAGNETS],
      ["Q1BPF_BeamlineMagnet_assembly_33", GROUP_MAGNETS],
      ["BeamPipeB0_assembly_38", GROUP_SUPPORT],
      ["Pipe_cen_to_pos_assembly_39", GROUP_SUPPORT],
      ["Q0EF_assembly_40", GROUP_MAGNETS],
      ["Q0EF_vac_41", GROUP_MAGNETS],
      ["Q1EF_assembly_42", GROUP_MAGNETS],
      ["Q1EF_vac_43", GROUP_MAGNETS],
      ["B0ECal_44", GROUP_CALORIMETRY],
      ["Pipe_Q1eR_to_B2BeR_assembly_54", GROUP_SUPPORT],
      ["Magnet_Q1eR_assembly_55", GROUP_MAGNETS],
      ["Magnet_Q2eR_assembly_56", GROUP_MAGNETS],
      ["Magnet_B2AeR_assembly_57", GROUP_MAGNETS],
      ["Magnet_B2BeR_assembly_58", GROUP_MAGNETS],
      ["Magnets_Q3eR_assembly_59", GROUP_MAGNETS],
    ]);

    this.config.addConfig(this.geometryFastAndUgly);
    this.config.addConfig(this.geometryCutListName);
    this.config.addConfig(this.geometryThemeName);
    this.config.addConfig(this.geometryRootFilterName);

    this.initWorker();
  }

  /**
   * Initialize the geometry loader worker
   */
  private initWorker(): void {
    if (typeof Worker === 'undefined') {
      console.warn('[GeometryService]: Web Workers not supported in this environment');
      return;
    }

    this.worker = new Worker(new URL('../workers/geometry-loader.worker', import.meta.url), {type: 'module'});

    this.worker.onmessage = ({data}: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(data);
    };

    this.worker.onerror = (error) => {
      console.error('[GeometryService]: Worker error:', error);
      // Reject all pending promises
      for (const [requestId, resolvers] of this.pendingResolvers) {
        resolvers.reject(new Error(`Worker error: ${error.message}`));
      }
      this.pendingResolvers.clear();
      this.currentRequestId = null;
    };
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(data: WorkerResponse): void {
    const resolvers = this.pendingResolvers.get(data.requestId);

    // Check if this response is for an old/stale request (not the current one)
    const isStaleRequest = data.requestId !== this.currentRequestId;

    if (data.type === 'progress') {
      // Only update progress for current request
      if (!isStaleRequest) {
        this.loadingProgress.set(data.progress);
        this.loadingStage.set(data.stage);
        if (resolvers?.onProgress) {
          resolvers.onProgress(data.stage, data.progress);
        }
      }
      return;
    }

    if (!resolvers) {
      // This can happen for stale requests that were already resolved
      if (isStaleRequest) {
        console.log(`[GeometryService]: Ignoring stale response for ${data.requestId} (current: ${this.currentRequestId})`);
      } else {
        console.warn(`[GeometryService]: No pending request for ${data.requestId}`);
      }
      return;
    }

    this.pendingResolvers.delete(data.requestId);

    // If this is a stale request, resolve as cancelled without processing
    if (isStaleRequest && data.type === 'success') {
      console.log(`[GeometryService]: Discarding stale geometry for ${data.requestId} (current: ${this.currentRequestId})`);
      resolvers.resolve({threeGeometry: null, cancelled: true});
      return;
    }

    if (data.requestId === this.currentRequestId) {
      this.currentRequestId = null;
    }

    if (data.type === 'success') {
      try {
        // Deserialize the geometry using ObjectLoader
        console.time('[GeometryService]: Parse geometry from JSON');
        const geometry = this.objectLoader.parse(data.geometryJson) as Object3D;
        console.timeEnd('[GeometryService]: Parse geometry from JSON');

        // jsroot creates objects with matrixAutoUpdate=false and sets matrices directly.
        // After deserialization, we need to ensure all matrices are properly applied.
        console.time('[GeometryService]: Update matrix world');
        this.restoreMatrixState(geometry);
        console.timeEnd('[GeometryService]: Update matrix world');

        // Build subdetectors from the worker's metadata
        this.buildSubdetectors(geometry, data.subdetectorInfos);

        this.geometry.set(geometry);
        this.loadingProgress.set(100);
        this.loadingStage.set('Complete');

        resolvers.resolve({threeGeometry: geometry, cancelled: false});
      } catch (error: any) {
        resolvers.reject(new Error(`Failed to parse geometry: ${error.message}`));
      }
    } else if (data.type === 'cancelled') {
      console.log(`[GeometryService]: Load cancelled for ${data.requestId}`);
      // Only reset progress if this is the current request
      if (!isStaleRequest) {
        this.loadingProgress.set(0);
        this.loadingStage.set('Cancelled');
      }
      resolvers.resolve({threeGeometry: null, cancelled: true});
    } else if (data.type === 'error') {
      // Only reset progress if this is the current request
      if (!isStaleRequest) {
        this.loadingProgress.set(0);
        this.loadingStage.set('Error');
      }
      resolvers.reject(new Error(data.error));
    }
  }

  /**
   * Build subdetector objects from worker metadata and deserialized geometry
   */
  private buildSubdetectors(geometry: Object3D, infos: SubdetectorInfo[]): void {
    this.subdetectors = [];

    if (!geometry.children.length || !geometry.children[0].children.length) {
      return;
    }

    const topDetectorNodes = geometry.children[0].children;

    for (let i = 0; i < topDetectorNodes.length && i < infos.length; i++) {
      const topNode = topDetectorNodes[i];
      const info = infos[i];

      const subdetector: Subdetector = {
        sourceGeometry: null,  // Not available when using worker
        sourceGeometryName: info.originalName,
        geometry: topNode,
        name: info.name,
        groupName: info.groupName
      };

      this.subdetectors.push(subdetector);
    }
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `geo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Restore matrix state after deserialization.
   * jsroot creates objects with matrixAutoUpdate=false and sets matrices directly.
   * Three.js ObjectLoader restores the matrix, but we need to ensure it's properly applied.
   */
  private restoreMatrixState(object: Object3D): void {
    // Traverse all objects and ensure matrices are properly set up
    object.traverse((child) => {
      // jsroot geometry uses matrixAutoUpdate = false
      child.matrixAutoUpdate = false;
      // Decompose the matrix to position/rotation/scale for proper rendering
      child.matrix.decompose(child.position, child.quaternion, child.scale);
    });

    // Update the world matrices for the entire hierarchy
    object.updateMatrixWorld(true);
  }

  /**
   * Cancel the current geometry loading operation.
   * The loading promise will resolve with cancelled: true.
   */
  cancelLoading(): void {
    if (!this.currentRequestId || !this.worker) {
      return;
    }

    console.log(`[GeometryService]: Cancelling load request ${this.currentRequestId}`);

    const cancelRequest: GeometryCancelRequest = {
      type: 'cancel',
      requestId: this.currentRequestId
    };

    this.worker.postMessage(cancelRequest);
  }

  /**
   * Check if geometry is currently being loaded
   */
  isLoading(): boolean {
    return this.currentRequestId !== null;
  }

  /**
   * Load geometry from a URL using a background worker.
   * This method keeps the UI responsive during loading.
   *
   * @param url The URL to load geometry from
   * @param onProgress Optional callback for progress updates
   * @returns Promise resolving to the loaded geometry or null if cancelled
   */
  async loadGeometry(
    url: string,
    onProgress?: GeometryProgressCallback
  ): Promise<{rootGeometry: any | null, threeGeometry: Object3D | null}> {

    this.subdetectors = [];
    this.rootGeometry = null;

    // Handle the default geometry alias
    if (url === DEFAULT_GEOMETRY) {
      url = 'https://eic.github.io/epic/artifacts/tgeo/epic_full.root';
    }

    const finalUrl = this.urlService.resolveDownloadUrl(url);

    console.log(`[GeometryService]: Loading geometry from ${finalUrl}`);
    console.time('[GeometryService]: Total load geometry time');

    // Cancel any existing load operation and immediately resolve old promise
    if (this.currentRequestId) {
      const oldRequestId = this.currentRequestId;
      const oldResolvers = this.pendingResolvers.get(oldRequestId);
      if (oldResolvers) {
        console.log(`[GeometryService]: Immediately resolving old request ${oldRequestId} as cancelled`);
        this.pendingResolvers.delete(oldRequestId);
        oldResolvers.resolve({threeGeometry: null, cancelled: true});
      }
      this.cancelLoading();
    }

    // Check if worker is available
    if (!this.worker) {
      throw new Error('Geometry loader worker is not available');
    }

    const requestId = this.generateRequestId();
    this.currentRequestId = requestId;

    this.loadingProgress.set(0);
    this.loadingStage.set('Starting');

    // Create the load request
    const request: GeometryLoadRequest = {
      type: 'load',
      requestId,
      url: finalUrl,
      options: {
        cutListName: this.geometryCutListName.value,
        rootFilterName: this.geometryRootFilterName.value
      }
    };

    // Create a promise that will be resolved by the worker message handler
    const result = await new Promise<GeometryLoadResult>((resolve, reject) => {
      this.pendingResolvers.set(requestId, {resolve, reject, onProgress});
      this.worker!.postMessage(request);
    });

    console.timeEnd('[GeometryService]: Total load geometry time');

    if (result.cancelled) {
      return {rootGeometry: null, threeGeometry: null};
    }

    return {rootGeometry: null, threeGeometry: result.threeGeometry};
  }

  public async postProcessing(geometry: Object3D, clippingPlanes: Plane[], prettifyOptions?: Omit<PrettifyOptions, 'clippingPlanes'>): Promise<void> {
    let threeGeometry = this.geometry();
    if (!threeGeometry) return;

    // Now we want to set default materials
    threeGeometry.traverse((child: any) => {
      if (child.type !== 'Mesh' || !child?.material?.isMaterial) {
        return;
      }

      // Handle the material of the child
      const color = getColorOrDefault(child.material, this.defaultColor);

      if(this.geometryFastAndUgly.value) {
        child.material = new MeshLambertMaterial({
          color: color,
          side: DoubleSide,
          transparent: false,
          opacity: 1,
          blending: THREE.NoBlending,
          depthTest: true,
          depthWrite: true,
          clippingPlanes,
          clipIntersection: true,
          clipShadows: false,
          fog: false,
          vertexColors: false,
          flatShading: true,
          toneMapped: false
        });
      } else {
        child.material = new MeshLambertMaterial({
          color: color,
          side: DoubleSide,
          transparent: true,
          opacity: 0.7,
          blending: NormalBlending,
          depthTest: true,
          depthWrite: true,
          clippingPlanes: clippingPlanes,
          clipIntersection: true,
          clipShadows: false,
        });
      }
    });

    // HERE WE DO POSTPROCESSING STEP
    let geoTheme = this.geometryThemeName.value;
    console.log(`[GeometryService]: Geometry theme name is set to '${geoTheme}'`);

    if(geoTheme === "cool2") {
      this.threeGeometryProcessor.processRuleSets(cool2ColorRules, this.subdetectors);
    } else if(geoTheme === "cool2no") {
      this.threeGeometryProcessor.processRuleSets(cool2NoOutlineColorRules, this.subdetectors);
    } else if(geoTheme === "cad") {
      this.threeGeometryProcessor.processRuleSets(cadColorRules, this.subdetectors);
    } else if(geoTheme === "grey") {
      this.threeGeometryProcessor.processRuleSets(monoColorRules, this.subdetectors);
    }

    // Apply prettification (reflective materials, environment maps) if not in fast mode
    if (!this.geometryFastAndUgly.value && prettifyOptions) {
      await prettify(threeGeometry, {
        ...prettifyOptions,
        clippingPlanes: clippingPlanes,
      });
    }

    threeGeometry.traverse((child: any) => {
      if (!child?.material?.isMaterial) {
        return;
      }

      if (child.material.type === 'LineMaterial' ||
          child.material.isLineMaterial ||
          child.type === 'Line2' ||
          child.type === 'LineSegments2') {
        return;
      }

      if (child.material?.clippingPlanes !== undefined) {
        child.material.clippingPlanes = clippingPlanes;
      }
      if (child.material?.clipIntersection !== undefined) {
        child.material.clipIntersection = true;
      }
      if (child.material?.clipShadows !== undefined) {
        child.material.clipShadows = false;
      }
    });
  }

  private stripIdFromName(name: string) {
      return name.replace(/_\d+$/, '');
  }

  toggleVisibility(object: Object3D) {
    if (object) {
      object.visible = !object.visible;
      console.log(`Visibility toggled for object: ${object.name}. Now visible: ${object.visible}`);
    }
  }
}

