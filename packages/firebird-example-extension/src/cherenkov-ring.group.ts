/**
 * Model side of the example extension: a data type Firebird has never heard
 * of (Cherenkov rings from a RICH detector) arrives in DEX and is decoded
 * into a typed EventGroup.
 *
 * This file is a @firebird/core citizen: plain TS, worker-safe, no Angular.
 * Only the registration lines (see index.ts) are Angular.
 */

// Deep import on purpose: the factory is registered from app.config (initial
// bundle), and the @firebird/core barrel re-exports painter modules that pull
// three.js. The model module is plain TS.
import { EventGroup, EventGroupFactory } from '@firebird/core/model/event-group';

/** One Cherenkov ring: center position [mm], radius [mm], photon count, time [ns]. */
export interface CherenkovRing {
  center: [number, number, number];
  radius: number;
  nPhotons: number;
  time: number;
}

export class CherenkovRingGroup extends EventGroup {
  /** Namespaced type string: reverse-dns-lite prefix prevents collisions
   * between experiment packages; bare names are reserved for core types. */
  static type = 'example.CherenkovRing';

  rings: CherenkovRing[] = [];

  constructor(name: string, origin?: string) {
    super(name, CherenkovRingGroup.type, origin);
  }

  static fromDexObject(obj: any): CherenkovRingGroup {
    const group = new CherenkovRingGroup(obj['name'], obj['origin']);
    for (const ring of obj['rings'] ?? []) {
      group.rings.push({
        center: ring['center'],
        radius: ring['radius'],
        nPhotons: ring['nPhotons'] ?? 0,
        time: ring['time'] ?? 0,
      });
    }
    return group;
  }

  override toDexObject(): any {
    return {
      name: this.name,
      type: this.type,
      origin: this.origin,
      rings: this.rings.map(r => ({ center: r.center, radius: r.radius, nPhotons: r.nPhotons, time: r.time })),
    };
  }

  override get timeRange(): [number, number] | null {
    if (this.rings.length === 0) return null;
    const times = this.rings.map(r => r.time);
    return [Math.min(...times), Math.max(...times)];
  }
}

export class CherenkovRingGroupFactory implements EventGroupFactory {
  type = CherenkovRingGroup.type;

  fromDexObject(obj: any): EventGroup {
    return CherenkovRingGroup.fromDexObject(obj);
  }
}
