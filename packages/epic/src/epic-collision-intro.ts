/**
 * The ePIC collision intro: the electron (blue, from +z) and the ion (red,
 * twice the size, from -z) fade in and fly to the interaction point, where
 * the event's time animation takes over. Registered by `withEpic()` through
 * a dynamic import (three.js).
 */

import { Mesh, MeshBasicMaterial, Object3D, SphereGeometry } from 'three';
import type { CollisionIntro } from '@dexvis/firebird-ng';

/** Distance from the interaction point at which the beams start [mm]. */
const START_DISTANCE = 5000;
/** Electron sphere radius [mm]; the ion sphere is twice as large. */
const ELECTRON_RADIUS = 30;
/** Fade-in time of both spheres [ms]. */
const FADE_IN_MS = 300;

export class EpicCollisionIntro implements CollisionIntro {
  readonly durationMs = 1000;

  private electron: Mesh<SphereGeometry, MeshBasicMaterial> | null = null;
  private ion: Mesh<SphereGeometry, MeshBasicMaterial> | null = null;

  begin(parent: Object3D): void {
    this.electron = this.beamParticle(ELECTRON_RADIUS, 0x0000FF);
    this.ion = this.beamParticle(2 * ELECTRON_RADIUS, 0xFF0000);
    parent.add(this.electron, this.ion);
    this.update(0);
  }

  update(elapsedMs: number): void {
    if (!this.electron || !this.ion) return;
    // Linear in time: the spheres meet at the interaction point at durationMs
    const opacity = Math.min(1, elapsedMs / FADE_IN_MS);
    const distance = START_DISTANCE * (1 - Math.min(1, elapsedMs / this.durationMs));
    this.electron.material.opacity = opacity;
    this.ion.material.opacity = opacity;
    this.electron.position.setZ(distance);
    this.ion.position.setZ(-distance);
  }

  end(): void {
    for (const particle of [this.electron, this.ion]) {
      if (!particle) continue;
      particle.removeFromParent();
      particle.geometry.dispose();
      particle.material.dispose();
    }
    this.electron = null;
    this.ion = null;
  }

  private beamParticle(radius: number, color: number): Mesh<SphereGeometry, MeshBasicMaterial> {
    return new Mesh(
      new SphereGeometry(radius, 32, 32),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0 }),
    );
  }
}
