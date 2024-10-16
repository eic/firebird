import {
  Object3D,
  InstancedMesh,
  BoxGeometry,
  ShaderMaterial,
  Object3D as THREEObject3D,
  InstancedBufferAttribute,
  Color,
  Matrix4,
} from 'three';
import { ComponentPainter } from './component-painter';
import { BoxTrackerHitComponent } from '../model/box-tracker-hit.component';
import {EntryComponent} from "../model/entry-component";

/**
 * Painter class for rendering BoxTrackerHitComponent using InstancedMesh.
 */
export class BoxTrackerHitPainter extends ComponentPainter {
  /** The InstancedMesh object to store multiple hit boxes. */
  private instancedMesh: InstancedMesh;

  /** Number of hits */
  private count: number;

  /** Shader material for the instanced mesh */
  private material: ShaderMaterial;

  /** Geometry for the instanced boxes */
  private geometry: BoxGeometry;


  private boxComponent: BoxTrackerHitComponent;

  /**
   * Constructs a new BoxHitPainter.
   *
   * @param node - The Object3D node where the instanced mesh will be added.
   * @param component - The BoxTrackerHitComponent containing the hit data.
   */
  constructor(node: Object3D, component: EntryComponent) {
    super(node, component);

    // Runtime type check
    if (component.type !== BoxTrackerHitComponent.type) {
      throw new Error('Invalid component type for BoxTrackerHitPainter');
    }

    this.boxComponent = component as BoxTrackerHitComponent;

    this.count = this.boxComponent.hits.length;

    // Define geometry for a unit box
    this.geometry = new BoxGeometry(1, 1, 1);

    // Define material for the boxes using shaders for time-based animation
    this.material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: this.vertexShader(),
      fragmentShader: this.fragmentShader(),
      // Enable per-instance coloring
      vertexColors: true,
    });

    // Create the instanced mesh
    this.instancedMesh = new InstancedMesh(this.geometry, this.material, this.count);

    // Set up each instance (position, scale, color, appearance time)
    this.setupInstances(this.boxComponent);

    // Add the instanced mesh to the node
    node.add(this.instancedMesh);
  }

  /**
   * Sets up the instances of the hits, including position, scale, color, and time.
   *
   * @param component - The BoxTrackerHitComponent with the hit data.
   */
  private setupInstances(component: BoxTrackerHitComponent): void {
    const instanceColors: number[] = [];
    const instanceTimes: number[] = [];
    const dummy = new Object3D();

    for (let i = 0; i < component.hits.length; i++) {
      const hit = component.hits[i];

      // Set position from hit data
      dummy.position.set(hit.position[0], hit.position[1], hit.position[2]);

      // Set non-uniform scale from hit dimensions
      dummy.scale.set(hit.dimensions[0], hit.dimensions[1], hit.dimensions[2]);

      // Update the transformation matrix for this instance
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, dummy.matrix);

      // Set color (e.g., based on energy deposit)
      // For example, mapping energy deposit to color intensity
      const edep = hit.energyDeposit[0];
      const color = new Color().setHSL(0.0, 1.0, Math.min(1.0, edep));

      instanceColors.push(color.r, color.g, color.b);

      // Set appearance time for this hit
      instanceTimes.push(hit.time[0]);
    }

    // Add per-instance color attribute
    const instanceColorAttr = new InstancedBufferAttribute(new Float32Array(instanceColors), 3);
    this.instancedMesh.instanceColor = instanceColorAttr;

    // Add per-instance appearance time attribute
    const instanceTimeAttr = new InstancedBufferAttribute(new Float32Array(instanceTimes), 1);
    this.instancedMesh.geometry.setAttribute('instanceAppearanceTime', instanceTimeAttr);
  }

  /**
   * Custom vertex shader to control the visibility based on time and transform the instance.
   */
  private vertexShader(): string {
    return `
      uniform float uTime;
      attribute float instanceAppearanceTime;
      attribute vec3 instanceColor;
      varying float vVisible;
      varying vec3 vColor;

      void main() {
        // Check if this instance should be visible at the current time
        vVisible = step(instanceAppearanceTime, uTime);

        // Pass the instance color to the fragment shader
        vColor = instanceColor;

        // Apply the usual transformations
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `;
  }

  /**
   * Custom fragment shader to render each box with its color and control its visibility.
   */
  private fragmentShader(): string {
    return `
      varying float vVisible;
      varying vec3 vColor;

      void main() {
        if (vVisible < 1.0) discard; // Skip rendering if not visible

        gl_FragColor = vec4(vColor, 1.0); // Apply the instance color
      }
    `;
  }

  /**
   * Paint method to update the time-based animation of the hits.
   *
   * @param time - The current time in nanoseconds or null for static rendering.
   */
  public paint(time: number | null): void {
    if (time !== null) {
      this.material.uniforms["uTime"].value = time; // Assuming time is in nanoseconds
    }

    // If instances move or change over time, update instanceMatrix
    // this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Dispose of resources used by the BoxHitPainter.
   */
  override dispose(): void {
    if (this.instancedMesh) {
      // Dispose of geometry
      this.instancedMesh.geometry.dispose();

      // Dispose of material(s)
      const materials = Array.isArray(this.instancedMesh.material)
        ? this.instancedMesh.material
        : [this.instancedMesh.material];
      materials.forEach((material) => material.dispose());

      // Remove the instanced mesh from the scene
      this.instancedMesh.parent?.remove(this.instancedMesh);
    }
    super.dispose();
  }
}
