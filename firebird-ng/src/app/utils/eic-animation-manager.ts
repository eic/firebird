import { Easing, Tween } from '@tweenjs/tween.js';
import {
  Scene,
  Camera,
  WebGLRenderer,
  Vector3,
  Color,
  MeshBasicMaterial,
  Mesh,
  SphereGeometry,
  Group
} from 'three';

/**
 * Example interface for presets
 */
export interface AnimationPreset {
  positions: { position: number[]; duration: number; easing?: any }[];
  animateEventAfterInterval?: number;
  collisionDuration?: number;
  name: string;
}

export class EicAnimationsManager {
  constructor(
    private scene: Scene,
    private camera: Camera,
    private renderer: WebGLRenderer
  ) {}

  /**
   * Example: Animate collision of two spheres, then run an event expansion.
   */
  public collideParticles(
    tweenDuration: number,
    particleSize: number = 10,
    distanceFromOrigin: number = 5000,
    particleColor: Color = new Color(0xffffff),
    onEnd?: () => void
  ) {
    const electronMat = new MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0 });
    const electron = new Mesh(new SphereGeometry(particleSize), electronMat);
    electron.position.set(0, 0, distanceFromOrigin);

    const ionMat = new MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0 });
    const ion = new Mesh(new SphereGeometry(particleSize * 1.5), ionMat);
    ion.position.set(0, 0, -distanceFromOrigin);

    this.scene.add(electron, ion);

    // fade in
    new Tween(electronMat).to({ opacity: 1 }, 300).start();
    new Tween(ionMat).to({ opacity: 1 }, 300).start();

    // move to center
    const electronTween = new Tween(electron.position).to({ z: 0 }, tweenDuration).start();
    const ionTween = new Tween(ion.position).to({ z: 0 }, tweenDuration).start();

    ionTween.onComplete(() => {
      this.scene.remove(electron, ion);
      onEnd?.();
    });
  }

  /**
   * Example: Animate "EventData" group expansions, etc.
   */
  public animateEvent(tweenDuration: number, onEnd?: () => void) {
    const eventDataGroup = this.scene.getObjectByName('EventData') as Group;
    if (!eventDataGroup) {
      console.warn('No EventData group found in scene!');
      return;
    }
    // Example: fade in, or set drawRange, etc.
    eventDataGroup.traverse((obj3d: any) => {
      if (obj3d.material && obj3d.geometry) {
        // example: from 0 to full drawRange
        if (obj3d.geometry.drawRange) {
          obj3d.geometry.setDrawRange(0, 0);
          new Tween(obj3d.geometry.drawRange)
            .to({ count: obj3d.geometry.attributes.position.count }, tweenDuration)
            .onComplete(() => {
              // done
            })
            .start();
        }
      }
    });
    // Fire onEnd at some point:
    setTimeout(() => {
      onEnd?.();
    }, tweenDuration + 500);
  }
}
