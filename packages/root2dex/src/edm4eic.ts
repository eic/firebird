/**
 * EDM4eic (eicrecon reconstruction output) -> Firebird DEX.
 *
 * Mirrors pyrobird's `pyrobird/edm4eic.py` piece for piece, so the same input
 * entry produces the same DEX document whether it went through the python CLI
 * or through this package in the browser.
 *
 * Collections converted:
 *   vector<edm4eic::TrackerHitData>   -> one BoxHit piece per collection
 *   edm4eic::TrackSegmentData + its TrackPoints -> one PointTrajectory piece
 *
 * Empty collections are kept as count-0 pieces (pyrobird does the same here;
 * the edm4hep path drops them instead).
 */

import { PIECE_VERSION, type DexEvent, type DexPiece } from './dex';
import { numbers, type ColumnBag, type PodioEventFile } from './podio-file';
import {
  mcParticlesBranchNames,
  mcParticlesToTrajectories,
  type McParticlesOptions,
} from './mc-particles';

export const EDM4EIC_TRACKER_HIT_TYPE = 'vector<edm4eic::TrackerHitData>';

/** The TrackSegment collection pyrobird converts; see EICrecon issue #1730. */
const SEGMENT_COLLECTION = 'CentralTrackSegments';
const TRACK_PARAMS_COLLECTION = 'CentralCKFTrackParameters';

/** Which collection groups to convert. Defaults to all of them. */
export type Edm4eicCollection = 'tracker_hits' | 'tracks' | 'mc_particles';
export const EDM4EIC_DEFAULT_COLLECTIONS: Edm4eicCollection[] = [
  'tracker_hits',
  'tracks',
  'mc_particles',
];

export interface Edm4eicOptions extends McParticlesOptions {
  collections?: Edm4eicCollection[];
}

const HIT_FIELDS = [
  'position.x',
  'position.y',
  'position.z',
  'positionError.xx',
  'positionError.yy',
  'positionError.zz',
  'time',
  'timeError',
  'edep',
  'edepError',
];

const POINT_FIELDS = [
  'position.x',
  'position.y',
  'position.z',
  'time',
  'timeError',
  'positionError.xx',
  'positionError.yy',
  'positionError.zz',
];

const TRACK_PARAM_FIELDS = ['theta', 'phi', 'qOverP', 'loc.a', 'loc.b', 'time'];

/** positionError.ii is a variance (sigma^2); the box spans +- one sigma. */
function boxWidth(variance: number): number {
  return variance > 0 ? 2 * Math.sqrt(variance) : 0.0;
}

/**
 * Every branch an edm4eic entry conversion reads. Collected up front so one
 * `readEntry` pass covers the whole event - see PodioEventFile.
 */
export function edm4eicBranchNames(
  file: PodioEventFile,
  collections: Edm4eicCollection[] = EDM4EIC_DEFAULT_COLLECTIONS,
  options: Edm4eicOptions = {},
): string[] {
  const names: string[] = [];
  if (collections.includes('tracker_hits')) {
    for (const name of file.collectionsOfType(EDM4EIC_TRACKER_HIT_TYPE)) {
      for (const field of HIT_FIELDS) names.push(`${name}.${field}`);
    }
  }
  if (collections.includes('tracks') && file.hasBranch(SEGMENT_COLLECTION)) {
    names.push(`${SEGMENT_COLLECTION}.points_begin`, `${SEGMENT_COLLECTION}.points_end`);
    const points = `_${SEGMENT_COLLECTION}_points`;
    for (const field of POINT_FIELDS) names.push(`${points}.${field}`);
    for (const field of TRACK_PARAM_FIELDS) names.push(`${TRACK_PARAMS_COLLECTION}.${field}`);
  }
  if (collections.includes('mc_particles')) {
    names.push(...mcParticlesBranchNames(options));
  }
  return names;
}

/** Converts one vector<edm4eic::TrackerHitData> collection to a BoxHit piece. */
export function trackerHitsToBoxHits(bag: ColumnBag, name: string): DexPiece {
  // The hit count comes from position.x; pyrobird reads cellID for it, which
  // this path skips - it is not written to DEX and costs a basket read.
  const posX = numbers(bag, `${name}.position.x`);
  const posY = numbers(bag, `${name}.position.y`);
  const posZ = numbers(bag, `${name}.position.z`);
  const errX = numbers(bag, `${name}.positionError.xx`);
  const errY = numbers(bag, `${name}.positionError.yy`);
  const errZ = numbers(bag, `${name}.positionError.zz`);

  const pos: number[] = [];
  const dim: number[] = [];
  for (let i = 0; i < posX.length; i++) {
    pos.push(posX[i], posY[i], posZ[i]);
    dim.push(boxWidth(errX[i]), boxWidth(errY[i]), boxWidth(errZ[i]));
  }

  return {
    name,
    type: 'BoxHit',
    version: PIECE_VERSION,
    origin: { type: 'edm4eic::TrackerHitData', name },
    count: posX.length,
    columns: {
      pos,
      dim,
      time: numbers(bag, `${name}.time`),
      timeError: numbers(bag, `${name}.timeError`),
      edep: numbers(bag, `${name}.edep`),
      edepError: numbers(bag, `${name}.edepError`),
    },
  };
}

/**
 * Converts edm4eic::TrackSegmentData plus its TrackPoints into one
 * PointTrajectory piece: each segment becomes one trajectory whose points run
 * from points_begin to points_end of the shared point collection.
 *
 * Track parameters come from CentralCKFTrackParameters positionally, which is
 * what pyrobird does - the one-to-one relation to Track cannot be followed
 * (EICrecon issue #1730).
 */
export function trackSegmentsToTrajectories(
  file: PodioEventFile,
  bag: ColumnBag,
  name: string,
  onWarning?: (message: string) => void,
): DexPiece {
  const piece: DexPiece = {
    name,
    type: 'PointTrajectory',
    version: PIECE_VERSION,
    origin: ['edm4eic::TrackPoint', 'edm4eic::TrackSegmentData'],
    count: 0,
    columns: {},
    pointColumns: ['x', 'y', 'z', 't', 'dx', 'dy', 'dz', 'dt'],
    points: [],
  };

  const beginIndex = numbers(bag, `${name}.points_begin`);
  const endIndex = numbers(bag, `${name}.points_end`);

  const pointsCollection = `_${name}_points`;
  if (!file.hasBranch(pointsCollection)) {
    // The file organizes the points differently, or there are none
    return piece;
  }

  const pointField = (field: string) => numbers(bag, `${pointsCollection}.${field}`);
  const px = pointField('position.x');
  const py = pointField('position.y');
  const pz = pointField('position.z');
  const pt = pointField('time');
  const pTimeError = pointField('timeError');
  const pErrXX = pointField('positionError.xx');
  const pErrYY = pointField('positionError.yy');
  const pErrZZ = pointField('positionError.zz');

  const paramsExist = file.hasBranch(TRACK_PARAMS_COLLECTION);
  const param = (field: string) =>
    paramsExist ? numbers(bag, `${TRACK_PARAMS_COLLECTION}.${field}`) : [];
  const theta = param('theta');
  const phi = param('phi');
  const qOverP = param('qOverP');
  const locA = param('loc.a');
  const locB = param('loc.b');
  const paramTime = param('time');

  const segmentCount = beginIndex.length;
  if (paramsExist && segmentCount !== theta.length) {
    onWarning?.(
      `len(${TRACK_PARAMS_COLLECTION}) != len(${name}). ` +
        `Might be a sign of format change or broken tree`,
    );
  }

  const allPoints: number[][][] = [];
  for (let segment = 0; segment < segmentCount; segment++) {
    const segmentPoints: number[][] = [];
    for (let i = beginIndex[segment]; i < endIndex[segment]; i++) {
      // pointColumns => [x, y, z, t, dx, dy, dz, dt]; the position errors are
      // variances, so the point extent is +- one sigma
      segmentPoints.push([
        px[i],
        py[i],
        pz[i],
        pt[i],
        boxWidth(pErrXX[i]),
        boxWidth(pErrYY[i]),
        boxWidth(pErrZZ[i]),
        pTimeError[i],
      ]);
    }
    allPoints.push(segmentPoints);
  }

  piece.count = segmentCount;
  piece.points = allPoints;
  if (paramsExist) {
    // trajectory id == index in every column; a missing tail (parameter list
    // shorter than segments) is padded with null rather than dropped
    const padded = (values: number[]) =>
      Array.from({ length: segmentCount }, (_, i) => (i < values.length ? values[i] : null));
    piece.columns = {
      theta: padded(theta),
      phi: padded(phi),
      q_over_p: padded(qOverP),
      loc_a: padded(locA),
      loc_b: padded(locB),
      time: padded(paramTime),
    };
  }
  return piece;
}

/** Converts one entry of an edm4eic 'events' tree to a DEX event object. */
export async function edm4eicEntryToDex(
  file: PodioEventFile,
  entry: number,
  options: Edm4eicOptions = {},
): Promise<DexEvent> {
  const collections = options.collections?.length
    ? options.collections
    : EDM4EIC_DEFAULT_COLLECTIONS;
  const bag = await file.readEntry(edm4eicBranchNames(file, collections, options), entry);

  const pieces: DexPiece[] = [];

  if (collections.includes('tracker_hits')) {
    for (const name of file.collectionsOfType(EDM4EIC_TRACKER_HIT_TYPE)) {
      pieces.push(trackerHitsToBoxHits(bag, name));
    }
  }

  if (collections.includes('tracks') && file.hasBranch(SEGMENT_COLLECTION)) {
    pieces.push(trackSegmentsToTrajectories(file, bag, SEGMENT_COLLECTION, options.onWarning));
  }

  if (collections.includes('mc_particles')) {
    const piece = mcParticlesToTrajectories(file, bag, options);
    if (piece.count > 0) pieces.push(piece);
  }

  return { id: entry, pieces };
}
