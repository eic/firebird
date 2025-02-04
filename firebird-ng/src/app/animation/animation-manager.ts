import {
  SphereGeometry,
  Vector3,
  Color,
  MeshBasicMaterial,
  Mesh,
  Scene,
  Camera,
  WebGLRenderer,
} from 'three';

// Animation Task Interface
export interface AnimationTask {
  name: string;
  duration: number;
  start(): Promise<void>;
  stop?(): void;
  pause?(): void;
  resume?(): void;
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


// EicAnimationsManager Class
export class AnimationManager {
  private EVENT_DATA_ID: string = 'Event';
  private sequences: Map<string, AnimationSequence> = new Map();

  constructor(
    private scene: Scene,
    private activeCamera: Camera,
    private renderer: WebGLRenderer
  ) {}

  registerSequence(sequence: AnimationSequence) {
    this.sequences.set(sequence.name, sequence);
  }

  async playSequence(name: string): Promise<void> {
    const sequence = this.sequences.get(name);
    if (sequence) {
      console.log(`Playing animation sequence: ${sequence.name}`);
      try {
        await sequence.run();
      } catch (error) {
        console.error(`Error during sequence ${sequence.name}:`, error);
      }
      console.log(`Finished animation sequence: ${sequence.name}`);
    } else {
      console.warn(`No sequence found with name: ${name}`);
    }
  }

  stopSequence(name: string): void {
    const sequence = this.sequences.get(name);
    if (sequence) {
      sequence.stop();
    }
  }

  pauseSequence(name: string): void {
    const sequence = this.sequences.get(name);
    if (sequence) {
      sequence.pause();
    }
  }

  resumeSequence(name: string): void {
    const sequence = this.sequences.get(name);
    if (sequence) {
      sequence.resume();
    }
  }
}
