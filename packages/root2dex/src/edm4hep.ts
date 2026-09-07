/**
 * EDM4hep (ddsim / DD4hep simulation output) -> Firebird DEX.
 *
 * Mirrors pyrobird's `pyrobird/edm4hep.py` piece for piece.
 *
 * Collections converted:
 *   vector<edm4hep::SimTrackerHitData> -> one BoxHit piece per collection
 *   vector<edm4hep::MCParticleData>    -> MC-truth trajectories connecting the
 *                                         sim hits of each particle
 *
 * Sim hits carry no positionError/timeError/edepError, so BoxHit dimensions use
 * a fixed configurable box size and the error columns are omitted entirely.
 */

import { PIECE_VERSION, type DexEvent, type DexPiece } from './dex';
import { numbers, type ColumnBag, type PodioEventFile } from './podio-file';
import {
  mcParticlesBranchNames,
  mcParticlesToTrajectories,
  type McParticlesOptions,
} from './mc-particles';

export const EDM4HEP_SIM_HIT_TYPE = 'vector<edm4hep::SimTrackerHitData>';

/** Sim hits have no positionError, so boxes get a fixed visualization size [mm]. */
export const DEFAULT_HIT_BOX_SIZE = 2.0;

/**
 * Cherenkov/PID collections record photon detections attributed to the emitting
 * charged particle (optical photons are not stored in MCParticles). Connecting
 * them into that particle's trajectory draws zigzags along the photosensor
 * planes, so they are excluded from trajectory building by default (they are
 * still converted as BoxHit pieces).
 */
export const DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS = ['DIRCBarHits', 'DRICHHits', 'PFRICHHits'];

/** Which collection groups to convert. Defaults to all of them. */
export type Edm4hepCollection = 'tracker_hits' | 'mc_trajectories' | 'mc_particles';
export const EDM4HEP_DEFAULT_COLLECTIONS: Edm4hepCollection[] = [
  'tracker_hits',
  'mc_trajectories',
  'mc_particles',
];

export interface Edm4hepOptions extends McParticlesOptions {
  collections?: Edm4hepCollection[];
  /** Box size in mm for sim hits, which carry no position error. */
  boxSize?: number;
  /** Prepend the MCParticle vertex (with its creation time) as trajectory point 0. */
  prependVertex?: boolean;
  /** Append the MCParticle endpoint as the last trajectory point. */
  appendEndpoint?: boolean;
  /** Particles with fewer hits are skipped; their hits stay visible as boxes. */
  minHits?: number;
  /** Collection name the sim-hit relations point to. */
  mcBranch?: string;
  trajectoryExcludedCollections?: string[];
  onWarning?: (message: string) => void;
}

const MC_FIELDS_ALWAYS = [
  'PDG',
  'charge',
  'time',
  'momentum.x',
  'momentum.y',
  'momentum.z',
  'vertex.x',
  'vertex.y',
  'vertex.z',
];
const MC_FIELDS_ENDPOINT = ['endpoint.x', 'endpoint.y', 'endpoint.z'];

/**
 * Finds the hit -> MCParticle relation branch, or null when missing.
 * edm4hep >= 0.99 names it '_<Collection>_particle', older versions
 * '_<Collection>_MCParticle'.
 */
export function findParticleRelationBranch(file: PodioEventFile, name: string): string | null {
  for (const suffix of ['particle', 'MCParticle']) {
    const candidate = `_${name}_${suffix}`;
    if (file.hasBranch(candidate)) return candidate;
  }
  return null;
}

/** Returns the energy deposit field name: 'eDep' (edm4hep >= 0.99) or 'EDep' (older). */
export function findEdepField(file: PodioEventFile, name: string): string | null {
  for (const field of ['eDep', 'EDep']) {
    if (file.hasBranch(`${name}.${field}`)) return field;
  }
  return null;
}

/**
 * Every branch an edm4hep entry conversion reads. Collected up front so one
 * `readEntry` pass covers the whole event - see PodioEventFile.
 */
export function edm4hepBranchNames(file: PodioEventFile, options: Edm4hepOptions = {}): string[] {
  const collections = options.collections?.length
    ? options.collections
    : EDM4HEP_DEFAULT_COLLECTIONS;
  const excluded =
    options.trajectoryExcludedCollections ?? DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS;
  const mcBranch = options.mcBranch ?? 'MCParticles';
  const hitBranches = file.collectionsOfType(EDM4HEP_SIM_HIT_TYPE);
  const names: string[] = [];

  if (collections.includes('tracker_hits')) {
    for (const name of hitBranches) {
      names.push(`${name}.position.x`, `${name}.position.y`, `${name}.position.z`, `${name}.time`);
      const edep = findEdepField(file, name);
      if (edep) names.push(`${name}.${edep}`);
    }
  }

  if (collections.includes('mc_trajectories')) {
    for (const field of MC_FIELDS_ALWAYS) names.push(`${mcBranch}.${field}`);
    if (options.appendEndpoint) {
      for (const field of MC_FIELDS_ENDPOINT) names.push(`${mcBranch}.${field}`);
    }
    for (const name of hitBranches) {
      if (excluded.includes(name)) continue;
      names.push(`${name}.position.x`, `${name}.position.y`, `${name}.position.z`, `${name}.time`);
      const relation = findParticleRelationBranch(file, name);
      if (relation) names.push(`${relation}.index`, `${relation}.collectionID`);
    }
  }

  if (collections.includes('mc_particles')) {
    names.push(...mcParticlesBranchNames(options));
  }

  return names;
}

/** Converts one vector<edm4hep::SimTrackerHitData> collection to a BoxHit piece. */
export function simTrackerHitsToBoxHits(
  file: PodioEventFile,
  bag: ColumnBag,
  name: string,
  boxSize = DEFAULT_HIT_BOX_SIZE,
  onWarning?: (message: string) => void,
): DexPiece {
  const posX = numbers(bag, `${name}.position.x`);
  const posY = numbers(bag, `${name}.position.y`);
  const posZ = numbers(bag, `${name}.position.z`);
  const count = posX.length;

  const edepField = findEdepField(file, name);
  let edep: number[];
  if (edepField) {
    edep = numbers(bag, `${name}.${edepField}`);
  } else {
    onWarning?.(`No eDep/EDep field found in '${name}', writing 0 energy deposit`);
    edep = new Array<number>(count).fill(0);
  }

  const pos: number[] = [];
  for (let i = 0; i < count; i++) pos.push(posX[i], posY[i], posZ[i]);

  return {
    name,
    type: 'BoxHit',
    version: PIECE_VERSION,
    origin: { type: 'edm4hep::SimTrackerHitData', name },
    count,
    columns: {
      // Sim data carries no errors, so the error columns are omitted entirely
      pos,
      dim: new Array<number>(3 * count).fill(boxSize),
      time: numbers(bag, `${name}.time`),
      edep,
    },
  };
}

/**
 * Builds MC-truth trajectories connecting SimTrackerHit hits.
 *
 * Hits from all `hitBranchNames` collections are pooled, grouped by their
 * associated MCParticle and sorted by time. Each particle with at least
 * `minHits` hits becomes one trajectory in a single PointTrajectory piece.
 */
export function simHitsToTrajectories(
  file: PodioEventFile,
  bag: ColumnBag,
  hitBranchNames: string[],
  options: Edm4hepOptions & { mcCollectionId?: number | null } = {},
): DexPiece {
  const mcBranch = options.mcBranch ?? 'MCParticles';
  const minHits = options.minHits ?? 2;
  const prependVertex = options.prependVertex ?? true;
  const appendEndpoint = options.appendEndpoint ?? false;
  const onWarning = options.onWarning;

  const piece: DexPiece = {
    name: 'McHitTrajectories',
    type: 'PointTrajectory',
    version: PIECE_VERSION,
    origin: {
      type: ['edm4hep::SimTrackerHitData', 'edm4hep::MCParticleData'],
      collections: [...hitBranchNames],
    },
    count: 0,
    columns: {},
    pointColumns: ['x', 'y', 'z', 't', 'dx', 'dy', 'dz', 'dt'],
    points: [],
  };

  if (!file.hasBranch(mcBranch)) {
    onWarning?.(`'${mcBranch}' collection not found, no trajectories are built`);
    return piece;
  }

  const mc = (field: string) => numbers(bag, `${mcBranch}.${field}`);
  const mcPdg = mc('PDG');
  const mcCharge = mc('charge');
  const mcTime = mc('time');
  const mcMomX = mc('momentum.x');
  const mcMomY = mc('momentum.y');
  const mcMomZ = mc('momentum.z');
  const mcVtxX = mc('vertex.x');
  const mcVtxY = mc('vertex.y');
  const mcVtxZ = mc('vertex.z');
  const mcEndX = appendEndpoint ? mc('endpoint.x') : [];
  const mcEndY = appendEndpoint ? mc('endpoint.y') : [];
  const mcEndZ = appendEndpoint ? mc('endpoint.z') : [];

  // eicrecon files carry a second MCParticle collection
  // (MCParticlesHeadOnFrameNoBeamFX); all known sim-hit relations point to
  // 'MCParticles', but sanity-check via collectionID when podio metadata is
  // available
  const mcCollectionId = options.mcCollectionId ?? null;

  // Pool hits from all collections grouped by MCParticle index.
  // Each hit is [time, x, y, z].
  const hitsByParticle = new Map<number, number[][]>();
  for (const name of hitBranchNames) {
    const relation = findParticleRelationBranch(file, name);
    if (relation === null) {
      onWarning?.(
        `No MCParticle relation branch found for '${name}', ` +
          `its hits are skipped in trajectory building`,
      );
      continue;
    }
    const posX = numbers(bag, `${name}.position.x`);
    const posY = numbers(bag, `${name}.position.y`);
    const posZ = numbers(bag, `${name}.position.z`);
    const time = numbers(bag, `${name}.time`);
    const mcIndex = numbers(bag, `${relation}.index`);
    const collectionIds = numbers(bag, `${relation}.collectionID`);

    for (let i = 0; i < posX.length; i++) {
      const index = mcIndex[i];
      if (index < 0 || index >= mcPdg.length) continue; // unfilled relation
      if (mcCollectionId !== null && collectionIds[i] !== mcCollectionId) {
        onWarning?.(
          `Hit in '${name}' points to an unexpected MCParticle collection ` +
            `(collectionID=${collectionIds[i]}), skipping it`,
        );
        continue;
      }
      let hits = hitsByParticle.get(index);
      if (!hits) {
        hits = [];
        hitsByParticle.set(index, hits);
      }
      hits.push([time[i], posX[i], posY[i], posZ[i]]);
    }
  }

  const columnNames = ['pdg', 'charge', 'px', 'py', 'pz', 'p', 'mc_index'] as const;
  const columns: Record<string, number[]> = {};
  for (const columnName of columnNames) columns[columnName] = [];
  const allPoints: number[][][] = [];

  for (const index of [...hitsByParticle.keys()].sort((a, b) => a - b)) {
    const particleHits = hitsByParticle.get(index)!;
    if (particleHits.length < minHits) continue;
    particleHits.sort((a, b) => a[0] - b[0]);

    // pointColumns => [x, y, z, t, dx, dy, dz, dt]; sim data has no errors
    const points: number[][] = [];
    if (prependVertex) {
      points.push([mcVtxX[index], mcVtxY[index], mcVtxZ[index], mcTime[index], 0, 0, 0, 0]);
    }
    for (const [hitTime, x, y, z] of particleHits) {
      points.push([x, y, z, hitTime, 0, 0, 0, 0]);
    }
    if (appendEndpoint) {
      // edm4hep stores no endpoint time, reuse the last hit time to keep time
      // animation monotonic
      const lastTime = particleHits[particleHits.length - 1][0];
      points.push([mcEndX[index], mcEndY[index], mcEndZ[index], lastTime, 0, 0, 0, 0]);
    }

    const momentum = Math.sqrt(
      mcMomX[index] ** 2 + mcMomY[index] ** 2 + mcMomZ[index] ** 2,
    );
    columns['pdg'].push(mcPdg[index]);
    columns['charge'].push(mcCharge[index]);
    columns['px'].push(mcMomX[index]);
    columns['py'].push(mcMomY[index]);
    columns['pz'].push(mcMomZ[index]);
    columns['p'].push(momentum);
    columns['mc_index'].push(index);
    allPoints.push(points);
  }

  piece.count = allPoints.length;
  piece.columns = allPoints.length ? columns : {};
  piece.points = allPoints;
  return piece;
}

/** Converts one entry of an edm4hep 'events' tree to a DEX event object. */
export async function edm4hepEntryToDex(
  file: PodioEventFile,
  entry: number,
  options: Edm4hepOptions & { mcCollectionId?: number | null } = {},
): Promise<DexEvent> {
  const collections = options.collections?.length
    ? options.collections
    : EDM4HEP_DEFAULT_COLLECTIONS;
  const excluded =
    options.trajectoryExcludedCollections ?? DEFAULT_TRAJECTORY_EXCLUDED_COLLECTIONS;
  const boxSize = options.boxSize ?? DEFAULT_HIT_BOX_SIZE;

  const bag = await file.readEntry(edm4hepBranchNames(file, options), entry);
  const hitBranches = file.collectionsOfType(EDM4HEP_SIM_HIT_TYPE);
  const pieces: DexPiece[] = [];

  if (collections.includes('tracker_hits')) {
    for (const name of hitBranches) {
      const piece = simTrackerHitsToBoxHits(file, bag, name, boxSize, options.onWarning);
      // Collections empty in this event are skipped
      if (piece.count > 0) pieces.push(piece);
    }
  }

  if (collections.includes('mc_trajectories')) {
    const trajectoryBranches = hitBranches.filter(name => !excluded.includes(name));
    const piece = simHitsToTrajectories(file, bag, trajectoryBranches, options);
    if (piece.count > 0) pieces.push(piece);
  }

  if (collections.includes('mc_particles')) {
    const piece = mcParticlesToTrajectories(file, bag, options);
    if (piece.count > 0) pieces.push(piece);
  }

  return { id: entry, pieces };
}
