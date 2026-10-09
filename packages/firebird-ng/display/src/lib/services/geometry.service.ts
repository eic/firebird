import {Injectable, inject, signal, WritableSignal} from '@angular/core';
import {ConfigProperty, ConfigService, resolveRegistry} from '@dexvis/app-features';
import {
  FIREBIRD_WORKERS,
  GEOMETRY_CUT_LIST_CONFIG,
  GEOMETRY_FAST_MATERIAL_CONFIG,
  GEOMETRY_ROOT_FILTER_CONFIG,
  GEOMETRY_THEME_CONFIG,
  GEOMETRY_THEMES,
  resolveRootGeometryRules,
  ROOT_GEOMETRY_RULES,
  RootGeometryLoadRules,
  RootGeometryRules,
  selectRootGeometryLoadRules,
  UrlService,
} from '@dexvis/firebird-ng/api';
import {Subdetector, DetectorThreeRuleSet, ThreeGeometryProcessor, getColorOrDefault} from '@dexvis/threejs-tree-editor';
import {Color, DoubleSide, MeshLambertMaterial, NormalBlending, Object3D, ObjectLoader, Plane} from "three";
import * as THREE from "three";


import type {
  WorkerResponse,
  GeometryLoadRequest,
  GeometryCancelRequest,
  SubdetectorInfo
} from "@dexvis/firebird-ng/workers/geometry";



/** Result returned by loadGeometry */
interface GeometryLoadResult {
  threeGeometry: Object3D | null;
  cancelled: boolean;
}

/** Progress callback type */
export type GeometryProgressCallback = (stage: string, progress: number) => void;

/** The rejection of a load that a newer load replaced. */
function replacedError(): DOMException {
  return new DOMException('A newer geometry load replaced this one', 'AbortError');
}

@Injectable({
  providedIn: 'root'
})
export class GeometryService {

  // Pipeline options from the config page (keys and defaults: config-keys.ts)
  geometryFastAndUgly: ConfigProperty<boolean>;
  geometryCutListName: ConfigProperty<string>;
  geometryThemeName: ConfigProperty<string>;
  geometryRootFilterName: ConfigProperty<string>;

  /** Collection of subdetectors */
  public subdetectors: Subdetector[] = [];

  /** TGeoManager - no longer available when using worker (kept for API compatibility) */
  public rootGeometry: any | null = null;

  /** Pre-build TGeo rules (withRootGeometryRules), merged once on the first load. */
  private readonly rootRuleSources = inject(ROOT_GEOMETRY_RULES, {optional: true}) ?? [];
  private rootRules: Promise<RootGeometryRules> | null = null;

  /** Geometry themes (withGeometryTheme), one per id: a later registration replaces an earlier one. */
  private readonly themes = resolveRegistry(inject(GEOMETRY_THEMES, {optional: true}) ?? [], theme => theme.id);

  /** for geometry post-processing */
  private threeGeometryProcessor = new ThreeGeometryProcessor();

  private defaultColor: Color = new Color(0x68698D);

  /** The geometry on screen: EventDisplayService sets it when it shows a load. */
  public geometry: WritableSignal<Object3D | null> = signal(null);

  /** Loading progress signal (0-100) */
  public loadingProgress: WritableSignal<number> = signal(0);

  /** Current loading stage description */
  public loadingStage: WritableSignal<string> = signal('');

  /** The worker factories of the application (withWorkers). */
  private readonly workers = inject(FIREBIRD_WORKERS, {optional: true});
  /** The geometry worker, created on the first load; dropped when it fails. */
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
    // declare returns the canonical instance for the key (the config page or
    // the data selector may have declared it first) — keep the returned reference.
    this.geometryFastAndUgly = this.config.declare(GEOMETRY_FAST_MATERIAL_CONFIG);
    this.geometryCutListName = this.config.declare(GEOMETRY_CUT_LIST_CONFIG);
    this.geometryThemeName = this.config.declare(GEOMETRY_THEME_CONFIG);
    this.geometryRootFilterName = this.config.declare(GEOMETRY_ROOT_FILTER_CONFIG);
  }

  /**
   * The geometry worker, started on first use. A worker that fails (its
   * script did not load, or it crashed) rejects every pending load and is
   * dropped, so the next load starts a fresh one instead of waiting forever
   * on a dead worker.
   */
  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') {
      throw new Error('Web Workers are not available, cannot load ROOT geometry in this browser');
    }
    if (!this.workers) {
      throw new Error('No geometry worker: add withWorkers({ geometry, rootFile }) to provideFirebird()');
    }
    const worker = this.workers.geometry();
    worker.onmessage = ({data}: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(data);
    };
    worker.onerror = (error) => {
      const message = `Geometry worker error: ${error.message ?? 'the worker script failed to load'}`;
      console.error(`[GeometryService]: ${message}`);
      for (const resolvers of this.pendingResolvers.values()) {
        resolvers.reject(new Error(message));
      }
      this.pendingResolvers.clear();
      this.currentRequestId = null;
      worker.terminate();
      if (this.worker === worker) this.worker = null;
    };
    this.worker = worker;
    return worker;
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
        groupName: ''
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
   * Loads ROOT TGeo geometry in the geometry worker, which keeps the UI
   * responsive while jsroot reads and builds it. Lengths stay in centimeters.
   * A newer load cancels this one.
   *
   * @param url The URL or path to load (aliases and server paths are
   *   resolved here), or a picked file, read in place.
   * @param options.signal Cancels the load: the worker stops and the
   *   promise rejects with the signal's reason.
   * @returns The geometry root.
   * @throws Error with the reason; an AbortError when the signal fired or a
   *   newer load replaced this one.
   */
  async loadGeometry(
    url: string | File,
    options: { signal?: AbortSignal; onProgress?: GeometryProgressCallback } = {},
  ): Promise<Object3D> {
    const {signal, onProgress} = options;
    signal?.throwIfAborted();
    const worker = this.ensureWorker();
    this.subdetectors = [];
    this.rootGeometry = null;

    // A picked/dropped file is read where it lies - there is no URL to resolve
    const finalUrl = typeof url === 'string' ? this.urlService.resolveDownloadUrl(url) : url;
    const label = typeof finalUrl === 'string' ? finalUrl : finalUrl.name;

    console.log(`[GeometryService]: Loading geometry from ${label}`);
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

    const requestId = this.generateRequestId();
    this.currentRequestId = requestId;

    this.loadingProgress.set(0);
    this.loadingStage.set('Starting');

    // The rules this load applies, chosen by the config names. Merging may
    // wait for a rule chunk to load, and a newer load can start meanwhile.
    let rules: RootGeometryLoadRules;
    try {
      this.rootRules ??= resolveRootGeometryRules(this.rootRuleSources);
      rules = selectRootGeometryLoadRules(
        await this.rootRules, this.geometryRootFilterName.value, this.geometryCutListName.value);
    } catch (error) {
      // The next load tries the rule chunks again
      this.rootRules = null;
      if (this.currentRequestId === requestId) this.currentRequestId = null;
      console.timeEnd('[GeometryService]: Total load geometry time');
      throw new Error(`Geometry rules failed to load: ${error instanceof Error ? error.message : error}`);
    }
    if (this.currentRequestId !== requestId || signal?.aborted) {
      if (this.currentRequestId === requestId) this.currentRequestId = null;
      console.timeEnd('[GeometryService]: Total load geometry time');
      throw signal?.reason ?? replacedError();
    }

    const request: GeometryLoadRequest = {
      type: 'load',
      requestId,
      url: finalUrl,
      rules,
    };

    // Resolved by the worker message handler; the signal cancels the request
    const abort = () => {
      if (this.currentRequestId === requestId) this.cancelLoading();
    };
    signal?.addEventListener('abort', abort, {once: true});
    let result: GeometryLoadResult;
    try {
      result = await new Promise<GeometryLoadResult>((resolve, reject) => {
        this.pendingResolvers.set(requestId, {resolve, reject, onProgress});
        worker.postMessage(request);
      });
    } finally {
      signal?.removeEventListener('abort', abort);
      console.timeEnd('[GeometryService]: Total load geometry time');
    }

    if (result.cancelled || !result.threeGeometry) {
      throw signal?.reason ?? replacedError();
    }
    return result.threeGeometry;
  }

  /**
   * The main-thread material pass of a loaded geometry: default materials,
   * then the theme selected by `geometry.themeName`, then the clipping
   * planes on every material.
   */
  public async postProcessing(threeGeometry: Object3D, clippingPlanes: Plane[]): Promise<void> {

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

    const ruleSets = await this.themeRuleSets(this.geometryThemeName.value);
    if (ruleSets) {
      await this.threeGeometryProcessor.processRuleSets([...ruleSets], this.subdetectors);
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

  /**
   * The rule sets of the theme `id`; undefined for 'off', and for an id no
   * feature registered (a saved choice from an installation with another
   * pack): the geometry then keeps its default materials.
   */
  private async themeRuleSets(id: string): Promise<readonly DetectorThreeRuleSet[] | undefined> {
    console.log(`[GeometryService]: Geometry theme name is set to '${id}'`);
    if (id === 'off') return undefined;
    const theme = this.themes.find(candidate => candidate.id === id);
    if (!theme) {
      console.warn(`[GeometryService]: No geometry theme '${id}' is registered; known: ${this.themes.map(known => known.id).join(', ') || 'none'}`);
      return undefined;
    }
    return theme.load();
  }

  toggleVisibility(object: Object3D) {
    if (object) {
      object.visible = !object.visible;
      console.log(`Visibility toggled for object: ${object.name}. Now visible: ${object.visible}`);
    }
  }
}

