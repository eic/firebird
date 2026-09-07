/**
 * MCParticles (vector<edm4hep::MCParticleData>) -> Firebird DEX.
 *
 * Mirrors pyrobird's `pyrobird/mc_particles.py` VALUE FOR VALUE - parity.spec.ts
 * pins the two against the same reference documents. Keep the arithmetic
 * expression-for-expression identical when changing either side.
 *
 * Both EDM4hep (ddsim) and EDM4eic (eicrecon) files carry this collection, so
 * the same conversion serves both models. Every particle becomes one straight
 * line from its vertex to its endpoint - no filtering, trajectory id equals the
 * MCParticle index. The line is subdivided on a fixed time grid so the event
 * display time animation reveals it gradually instead of popping it in whole.
 *
 * EDM4hep stores no endpoint time; the flight duration is computed from the
 * relativistic speed beta = p/E with E = sqrt(p^2 + m^2), which is exact for
 * the straight-line (no field, no energy loss) picture this piece draws.
 */

import { PIECE_VERSION, type DexPiece } from './dex';
import { numbers, type ColumnBag, type PodioEventFile } from './podio-file';

/** Time step [ns] of the interpolation grid; matches the `pyrobird smooth` default. */
export const DEFAULT_MC_STEP_TIME = 0.2;

/**
 * Size guard: a particle flying far (a neutrino crossing the world volume) gets
 * its grid coarsened so one line never exceeds this many points.
 */
export const DEFAULT_MC_MAX_POINTS = 128;

/** Speed of light [mm/ns]. */
export const C_LIGHT = 299.792458;

export interface McParticlesOptions {
  /** Collection name, 'MCParticles' in every known file. */
  mcBranch?: string;
  /** Time step in ns of the straight-line interpolation grid. */
  mcStepTime?: number;
  /** Maximum points per particle line; longer flights get a coarser grid. */
  mcMaxPoints?: number;
  onWarning?: (message: string) => void;
}

const MC_PARTICLE_FIELDS = [
  'PDG',
  'generatorStatus',
  'charge',
  'time',
  'mass',
  'vertex.x',
  'vertex.y',
  'vertex.z',
  'endpoint.x',
  'endpoint.y',
  'endpoint.z',
  'momentum.x',
  'momentum.y',
  'momentum.z',
];

/** Every branch the mc_particles conversion reads. */
export function mcParticlesBranchNames(options: McParticlesOptions = {}): string[] {
  const mcBranch = options.mcBranch ?? 'MCParticles';
  return MC_PARTICLE_FIELDS.map(field => `${mcBranch}.${field}`);
}

/**
 * Subdivides the straight line vertex->endpoint on a fixed time grid.
 *
 * Returns [x, y, z, t] points: the vertex at `startTime`, interior points every
 * `stepTime` ns of flight, and the endpoint at the arrival time. A particle
 * that cannot move (beta <= 0) or does not move (zero distance) yields the two
 * end points with equal times. `maxPoints` bounds the list; when the flight
 * needs more grid steps, the step widens to duration / (n + 1) so the
 * subdivision stays uniform.
 */
export function interpolateLinePoints(
  vx: number, vy: number, vz: number,
  ex: number, ey: number, ez: number,
  startTime: number, beta: number,
  stepTime = DEFAULT_MC_STEP_TIME, maxPoints = DEFAULT_MC_MAX_POINTS,
): number[][] {
  const dx = ex - vx;
  const dy = ey - vy;
  const dz = ez - vz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const duration = beta > 0 ? dist / (beta * C_LIGHT) : 0.0;

  const points: number[][] = [[vx, vy, vz, startTime]];
  if (duration > 0) {
    let nMid = Math.max(0, Math.ceil(duration / stepTime) - 1);
    if (nMid > maxPoints - 2) {
      nMid = maxPoints - 2;
    }
    const step = duration / (nMid + 1);
    for (let k = 1; k <= nMid; k++) {
      const tOff = k * step;
      const alpha = tOff / duration;
      points.push([vx + alpha * dx, vy + alpha * dy, vz + alpha * dz, startTime + tOff]);
    }
  }
  points.push([ex, ey, ez, startTime + duration]);
  return points;
}

/**
 * Converts the MCParticles collection of one read entry to a PointTrajectory
 * piece. Every particle is one straight line vertex->endpoint (trajectory id
 * equals the MCParticle index), subdivided on a fixed time grid - see the
 * module doc. Returns a count-0 piece when the collection is absent.
 */
export function mcParticlesToTrajectories(
  file: PodioEventFile,
  bag: ColumnBag,
  options: McParticlesOptions = {},
): DexPiece {
  const mcBranch = options.mcBranch ?? 'MCParticles';
  const stepTime = options.mcStepTime ?? DEFAULT_MC_STEP_TIME;
  const maxPoints = options.mcMaxPoints ?? DEFAULT_MC_MAX_POINTS;

  const piece: DexPiece = {
    name: mcBranch,
    type: 'PointTrajectory',
    version: PIECE_VERSION,
    origin: { type: 'edm4hep::MCParticleData', name: mcBranch },
    count: 0,
    columns: {},
    pointColumns: ['x', 'y', 'z', 't'],
    points: [],
  };

  if (!file.hasBranch(mcBranch)) {
    options.onWarning?.(`'${mcBranch}' collection not found, no MC particle lines are built`);
    return piece;
  }

  const field = (name: string) => numbers(bag, `${mcBranch}.${name}`);
  const pdg = field('PDG');
  const genStatus = field('generatorStatus');
  const charge = field('charge');
  const time = field('time');
  const mass = field('mass');
  const vtxX = field('vertex.x');
  const vtxY = field('vertex.y');
  const vtxZ = field('vertex.z');
  const endX = field('endpoint.x');
  const endY = field('endpoint.y');
  const endZ = field('endpoint.z');
  const momX = field('momentum.x');
  const momY = field('momentum.y');
  const momZ = field('momentum.z');

  const count = pdg.length;
  const momentum: number[] = [];
  const allPoints: number[][][] = [];
  for (let i = 0; i < count; i++) {
    const p = Math.sqrt(momX[i] * momX[i] + momY[i] * momY[i] + momZ[i] * momZ[i]);
    const energy = Math.sqrt(p * p + mass[i] * mass[i]);
    const beta = energy > 0 ? p / energy : 0.0;
    momentum.push(p);
    allPoints.push(interpolateLinePoints(
      vtxX[i], vtxY[i], vtxZ[i], endX[i], endY[i], endZ[i],
      time[i], beta, stepTime, maxPoints));
  }

  piece.count = count;
  piece.points = allPoints;
  if (count) {
    piece.columns = {
      pdg,
      charge,
      gen_status: genStatus,
      px: momX,
      py: momY,
      pz: momZ,
      p: momentum,
      mass,
    };
  }
  return piece;
}
