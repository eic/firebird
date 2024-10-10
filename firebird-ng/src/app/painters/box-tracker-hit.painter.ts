import {BoxGeometry, InstancedBufferAttribute, InstancedMesh, Object3D, ShaderMaterial} from 'three';
import {ComponentPainter} from './component-painter';
import {BoxTrackerHitComponent} from '../model/box-tracker-hit.component';

/**
 * Painter class for rendering BoxTrackerHitComponent using InstancedMesh.
 */
export class BoxHitPainter extends ComponentPainter {

  /** The InstancedMesh object to store multiple hit boxes. */
  private instancedMesh: InstancedMesh;

  /** Number of hits */
  private count: number;

  /** Time uniform for controlling the animation */
  private material: ShaderMaterial;

  /** Geometry for the instanced boxes */
  private geometry: BoxGeometry;

  /**
   * Constructs a new BoxHitPainter.
   *
   * @param node - The Object3D node where the instanced mesh will be added.
   * @param component - The BoxTrackerHitComponent containing the hit data.
   */
  constructor(node: Object3D, component: BoxTrackerHitComponent) {
    super(node, component);

    this.count = component.hits.length;

    // Define geometry for a unit box
    this.geometry = new BoxGeometry(1, 1, 1);

    // Define material for the boxes using shaders for time-based animation
    this.material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 } // Global time uniform to control visibility
      },
      vertexShader: `
    uniform float uTime;
    attribute float instanceAppearanceTime;
    attribute vec3 instanceColor;

    varying float vVisible;
    varying vec3 vColor;

    void main() {
      // Pass the instance's color to the fragment shader
      vColor = instanceColor;

      // Compute visibility based on the global time and the instance's appearance time
      vVisible = step(instanceAppearanceTime, uTime);

      // Apply the transformation for this instance
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
      fragmentShader: `
    varying float vVisible;
    varying vec3 vColor;

    void main() {
      // If the hit is not yet visible, discard this fragment
      if (vVisible < 1.0) discard;

      // Render the hit with the given color
      gl_FragColor = vec4(vColor, 1.0);
    }
  `
    });


    // Create the instanced mesh
    this.instancedMesh = new InstancedMesh(this.geometry, this.material, this.count);

    // Set up each instance (position, scale, color, appearance time)
    this.setupInstances(component);

    // Add the instanced mesh to the node
    node.add(this.instancedMesh);
  }

  /**
   * Sets up the instances of the hits, including position, scale, and time.
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

      // Set random color (this can be changed based on hit properties)
      instanceColors.push(Math.random(), Math.random(), Math.random());

      // Set appearance time for this hit
      instanceTimes.push(hit.time[0]);
    }

    // Add per-instance color attribute
    this.instancedMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(instanceColors), 3);

    // Add per-instance appearance time attribute
    const instanceTimeAttr = new InstancedBufferAttribute(new Float32Array(instanceTimes), 1);
    this.instancedMesh.geometry.setAttribute('instanceAppearanceTime', instanceTimeAttr);
  }


  /**
   * Paint method to update the time-based animation of the hits.
   *
   * @param time - The current time in nanoseconds or null for static rendering.
   */
  public paint(time: number | null): void {
    if (time !== null) {
      this.material.uniforms["uTime"].value = time / 1000; // Convert to seconds
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Dispose of resources used by the BoxHitPainter.
   */
  override dispose(): void {
    if (this.instancedMesh) {
      this.instancedMesh.geometry.dispose();
      // Dispose of material(s)
      const materials = Array.isArray(this.instancedMesh.material) ? this.instancedMesh.material : [this.instancedMesh.material];
      materials.forEach((material) => material.dispose());
      this.instancedMesh.parent?.remove(this.instancedMesh);
    }
    super.dispose();
  }
}
