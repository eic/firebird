import { Easing, Tween } from '@tweenjs/tween.js';
import {AnimationTask} from "./animation-manager";
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  Mesh,
  MeshBasicMaterial, Plane,
  Scene,
  Sphere,
  SphereGeometry,
  TubeGeometry,
  Vector3, WebGLRenderer
} from "three";

export class CameraMoveTask implements AnimationTask {
  name = 'CameraMove';
  duration: number;
  private currentTween: Tween<Vector3> | null = null;

  constructor(
    private camera: Camera,
    private targetPosition: Vector3,
    duration: number,
    private easing?: (amount: number) => number
  ) {
    this.duration = duration;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.currentTween = new Tween(this.camera.position)
        .to(this.targetPosition, this.duration)
        .onComplete(() => {
          this.currentTween = null;
          resolve();
        })
        .start();

      if (this.easing) {
        this.currentTween.easing(this.easing);
      }
    });
  }

  stop?(): void {
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }
  }

  pause?(): void {
    if (this.currentTween) {
      this.currentTween.pause();
    }
  }

  resume?(): void {
    if (this.currentTween) {
      this.currentTween.resume();
    }
  }
}

// Concrete Animation Task: ParticleCollisionTask
export class ParticleCollisionTask implements AnimationTask {
  name = 'ParticleCollision';
  duration: number;

  constructor(
    private scene: Scene,
    duration: number,
    private particleSize: number = 10,
    private distanceFromOrigin: number = 5000,
    private particleColor: Color = new Color(0xffffff)
  ) {
    this.duration = duration;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      const electronGeometry = new SphereGeometry(
        0.5 * this.particleSize,
        32,
        32
      );
      const electronMaterial = new MeshBasicMaterial({
        color: 0x0000ff,
        transparent: true,
        opacity: 0,
      });
      const electron = new Mesh(electronGeometry, electronMaterial);

      const ionMaterial = new MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0,
      });
      const ionGeometry = new SphereGeometry(2 * this.particleSize, 32, 32);
      const ion = new Mesh(ionGeometry, ionMaterial);

      electron.position.setZ(this.distanceFromOrigin);
      ion.position.setZ(-this.distanceFromOrigin);

      const particles = [electron, ion];

      this.scene.add(...particles);

      const particleTweens = [];

      for (const particle of particles) {
        new Tween(particle.material)
          .to(
            {
              opacity: 1,
            },
            300
          )
          .start();

        const particleToOrigin = new Tween(particle.position)
          .to(
            {
              z: 0,
            },
            this.duration
          )
          .start();

        particleTweens.push(particleToOrigin);
      }

      particleTweens[0].onComplete(() => {
        this.scene.remove(...particles);
        resolve();
      });
    });
  }
}

// Animation Task: AnimateThroughEventTask
export class AnimateThroughEventTask implements AnimationTask {
  name = 'AnimateThroughEvent';
  duration: number;
  private startPos: number[];
  private tweens: Tween<any>[] = [];
  private onAnimationEnd?: () => void;

  constructor(
    private camera: Camera,
    startPos: number[],
    tweenDuration: number,
    onAnimationEnd?: () => void
  ) {
    this.startPos = startPos;
    this.duration = tweenDuration;
    this.onAnimationEnd = onAnimationEnd;
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Move to start
      const start = this.getCameraTween(this.startPos, 1000, Easing.Cubic.Out);
      // Move to position along the detector axis
      const alongAxisPosition = [0, 0, this.startPos[2]];
      const startXAxis = this.getCameraTween(alongAxisPosition, this.duration);

      const radius = 500;
      const numOfSteps = 24;
      const angle = 3 * Math.PI;
      const step = angle / numOfSteps;

      const rotationPositions = [];
      for (let i = 1; i <= numOfSteps; i++) {
        rotationPositions.push([
          radius * Math.sin(step * i), // x
          0, // y
          radius * Math.cos(step * i), // z
        ]);
      }

      // Go to origin
      const rotateStart = this.getCameraTween(
        [0, 0, radius],
        this.duration,
        Easing.Cubic.Out
      );

      let rotate = rotateStart;
      const rotationTime = this.duration * 4;
      const singleRotationTime = rotationTime / numOfSteps;
      // Rotating around the event
      for (const pos of rotationPositions) {
        const animation = this.getCameraTween(pos, singleRotationTime);
        rotate.chain(animation);
        rotate = animation;
      }

      // Go to the end position and then back to the starting point
      const endPos = [0, 0, -this.startPos[2]];
      const end = this.getCameraTween(endPos, this.duration, Easing.Cubic.In);
      const startClone = this.getCameraTween(
        this.startPos,
        this.duration,
        Easing.Cubic.Out
      );
      startClone.onComplete(() => {
        this.onAnimationEnd?.();
        resolve();
      });
      startClone.delay(500);

      start.chain(startXAxis);
      startXAxis.chain(rotateStart);
      rotate.chain(end);
      end.chain(startClone);

      this.tweens = [start, startXAxis, rotateStart, ...rotate['_chainedTweens'], end, startClone];
      start.start();
    });
  }

  stop?(): void {
    for (const tween of this.tweens) {
      tween.stop();
    }
  }

  pause?(): void {
    for (const tween of this.tweens) {
      tween.pause();
    }
  }

  resume?(): void {
    for (const tween of this.tweens) {
      tween.resume();
    }
  }

  private getCameraTween(
    pos: number[],
    duration: number = 1000,
    easing?: typeof Easing.Linear.None
  ) {
    const tween = new Tween(this.camera.position).to(
      { x: pos[0], y: pos[1], z: pos[2] },
      duration
    );

    if (easing) {
      tween.easing(easing);
    }

    return tween;
  }
}

// Animation Task: AnimateEventTask
export class AnimateEventTask implements AnimationTask {
  name = 'AnimateEvent';
  duration: number;
  private onEnd?: () => void;
  private onAnimationStart?: () => void;
  private animationSphere: Sphere;
  private animationSphereTween: Tween<Sphere>;
  private animationSphereTweenClone: Tween<Sphere>;
  private eventObjectTweens: Tween<any>[] = [];

  constructor(
    private scene: Scene,
    private EVENT_DATA_ID: string,
    tweenDuration: number,
    onEnd?: () => void,
    onAnimationStart?: () => void
  ) {
    this.duration = tweenDuration;
    this.onEnd = onEnd;
    this.onAnimationStart = onAnimationStart;
    this.animationSphere = new Sphere(new Vector3(), 0);
    this.animationSphereTween = new Tween(this.animationSphere)
      .to({ radius: 3000 }, this.duration * 0.75)
      .onUpdate(() => this.onAnimationSphereUpdate()); // Remove extra parameter
    this.animationSphereTweenClone = new Tween(this.animationSphere)
      .to({ radius: 10000 }, this.duration * 0.25)
      .onUpdate(() => this.onAnimationSphereUpdate()); // Remove extra parameter
    this.animationSphereTween.chain(this.animationSphereTweenClone);
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      const eventData = this.scene.getObjectByName(this.EVENT_DATA_ID);
      if (!eventData) {
        console.error(
          'this.scene.getObjectByName(this.EVENT_DATA_ID) returned null or undefined'
        );
        resolve();
        return;
      }

      // Traverse over all event data
      eventData.traverse((eventObject: any) => {
        if (eventObject.geometry) {
          // Animation for extrapolating tracks without changing scale
          if (
            eventObject.name === 'Track' ||
            eventObject.name === 'LineHit'
          ) {
            // Check if geometry drawRange count exists
            let geometryPosCount =
              eventObject.geometry?.attributes?.position?.count;
            if (geometryPosCount) {
              // WORKAROUND
              // Changing position count for TubeGeometry because
              // what we get is not the actual and it has Infinity drawRange count
              if (eventObject.geometry instanceof TubeGeometry) {
                geometryPosCount *= 6;
              }

              if (eventObject.geometry instanceof BufferGeometry) {
                const oldDrawRangeCount = eventObject.geometry.drawRange.count;
                eventObject.geometry.setDrawRange(0, 0);
                const eventObjectTween = new Tween(
                  eventObject.geometry.drawRange
                )
                  .to(
                    {
                      count: geometryPosCount,
                    },
                    this.duration * 0.75
                  )
                  .onComplete(() => {
                    eventObject.geometry.drawRange.count = oldDrawRangeCount;
                  });
                this.eventObjectTweens.push(eventObjectTween);
              }
            }
          }
        }
      });

      this.eventObjectTweens[0]?.onStart(() => this.onAnimationStart?.());
      this.animationSphereTweenClone.onComplete(() => {
        // Remove this line
        // this.onAnimationSphereUpdate(new Sphere(new Vector3(), Infinity));
        this.onEnd?.();
        resolve();
      });

      for (const tween of this.eventObjectTweens) {
        tween.easing(Easing.Quartic.Out).start();
      }
      this.animationSphereTween.start();
    });
  }

  private onAnimationSphereUpdate() {
    // Now empty. Remove this function if not required.
  }

  stop?(): void {
    this.animationSphereTween.stop();
    this.animationSphereTweenClone.stop();
    for (const tween of this.eventObjectTweens) {
      tween.stop();
    }
  }

  pause?(): void {
    this.animationSphereTween.pause();
    this.animationSphereTweenClone.pause();
    for (const tween of this.eventObjectTweens) {
      tween.pause();
    }
  }

  resume?(): void {
    this.animationSphereTween.resume();
    this.animationSphereTweenClone.resume();
    for (const tween of this.eventObjectTweens) {
      tween.resume();
    }
  }
}

// Animation Task: AnimateEventWithClippingTask
export class AnimateEventWithClippingTask implements AnimationTask {
  name = 'AnimateEventWithClipping';
  duration: number;
  private onEnd?: () => void;
  private onAnimationStart?: () => void;
  private clippingConstant: number;
  private animationClipPlanes: Plane[] = [];
  private allTweens: Tween<any>[] = [];

  constructor(
    private scene: Scene,
    private renderer: WebGLRenderer,
    private EVENT_DATA_ID: string,
    tweenDuration: number,
    onEnd?: () => void,
    onAnimationStart?: () => void,
    clippingConstant: number = 11000
  ) {
    this.duration = tweenDuration;
    this.onEnd = onEnd;
    this.onAnimationStart = onAnimationStart;
    this.clippingConstant = clippingConstant;
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      const allEventData = this.scene.getObjectByName(this.EVENT_DATA_ID);
      if (!allEventData) {
        console.error(
          'this.scene.getObjectByName(this.EVENT_DATA_ID) returned null or undefined'
        );
        resolve();
        return;
      }

      const sphere = new SphereGeometry(1, 8, 8);
      const position = sphere.attributes['position'];
      const vertex = new Vector3();
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position as BufferAttribute, i);
        this.animationClipPlanes.push(new Plane(vertex.clone(), 0));
      }

      const prevLocalClipping = this.renderer.localClippingEnabled;
      if (!prevLocalClipping) {
        this.renderer.localClippingEnabled = true;
      }

      allEventData.traverse((eventObject: any) => {
        if (eventObject.geometry && eventObject.material) {
          eventObject.material.clippingPlanes = this.animationClipPlanes;
        }
      });

      for (const animationClipPlane of this.animationClipPlanes) {
        animationClipPlane.constant = 0;
        const tween = new Tween(animationClipPlane)
          .to({ constant: this.clippingConstant }, this.duration)
          .onComplete(() => {
            if (animationClipPlane === this.animationClipPlanes[this.animationClipPlanes.length - 1]) {
              if (!prevLocalClipping) {
                this.renderer.localClippingEnabled = false;
              }
              allEventData.traverse((eventObject: any) => {
                if (eventObject.geometry && eventObject.material) {
                  eventObject.material.clippingPlanes = null;
                }
              });
              this.onEnd?.();
              resolve();
            }
          });
        this.allTweens.push(tween);
      }

      this.allTweens[0].onStart(() => this.onAnimationStart?.());

      for (const tween of this.allTweens) {
        tween.start();
      }
    });
  }

  stop?(): void {
    for (const tween of this.allTweens) {
      tween.stop();
    }
  }

  pause?(): void {
    for (const tween of this.allTweens) {
      tween.pause();
    }
  }

  resume?(): void {
    for (const tween of this.allTweens) {
      tween.resume();
    }
  }
}

// Animation Sequence Class
export class AnimationSequence {
  private tasks: AnimationTask[] = [];
  private currentTaskIndex: number = 0;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;

  constructor(public name: string) {}

  addTask(task: AnimationTask): AnimationSequence {
    this.tasks.push(task);
    return this;
  }

  async run(): Promise<void> {
    if (this.isPlaying) {
      return; // Already running
    }

    this.isPlaying = true;
    this.isPaused = false;

    if (this.currentTaskIndex >= this.tasks.length) {
      this.currentTaskIndex = 0; // Reset if we've reached the end
    }

    for (
      let i = this.currentTaskIndex;
      i < this.tasks.length && this.isPlaying;
      i++
    ) {
      const task = this.tasks[i];
      this.currentTaskIndex = i;
      console.log(`Starting animation task: ${task.name}`);

      if (this.isPaused) {
        console.log(`Animation sequence paused at task: ${task.name}`);
        await this.waitForResume();
      }

      if (!this.isPlaying) {
        console.log(
          `Animation sequence stopped during task: ${task.name}`
        );
        break; // Exit loop if stopped
      }

      await task.start();
      console.log(`Finished animation task: ${task.name}`);
    }

    this.isPlaying = false;
    this.isPaused = false;
    this.currentTaskIndex = 0;
  }

  stop(): void {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    this.isPaused = false;
    // Stop the currently running task
    const currentTask = this.tasks[this.currentTaskIndex];
    if (currentTask && currentTask.stop) {
      currentTask.stop();
    }
  }

  pause(): void {
    if (!this.isPlaying || this.isPaused) return;

    this.isPaused = true;
    // Pause the currently running task
    const currentTask = this.tasks[this.currentTaskIndex];
    if (currentTask && currentTask.pause) {
      currentTask.pause();
    }
  }

  resume(): void {
    if (!this.isPaused) return;

    this.isPaused = false;
    // Resume the currently paused task
    const currentTask = this.tasks[this.currentTaskIndex];
    if (currentTask && currentTask.resume) {
      currentTask.resume();
    }
  }

  private waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      const checkResume = () => {
        if (!this.isPaused) {
          resolve();
        } else {
          setTimeout(checkResume, 100);
        }
      };
      checkResume();
    });
  }
}
