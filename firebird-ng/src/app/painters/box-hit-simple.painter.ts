import {
  Object3D,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
  Color,
} from 'three';
import { EventGroupPainter } from './event-group-painter';
import { BoxHitGroup } from '../model/box-hit.group';
import { EventGroup } from '../model/event-group';

/**
 * Alternative Painter class for rendering BoxHitGroup using individual Meshes.
 */
export class BoxHitSimplePainter extends EventGroupPainter {
  /** Array of Mesh objects representing hits */
  private hitMeshes: Mesh[] = [];

  private boxComponent: BoxHitGroup;

  /**
   * Constructs a new BoxHitAlternativePainter.
   *
   * @param parentNode - The Object3D node where the hit meshes will be added.
   * @param component - The BoxHitGroup containing the hit data.
   */
  constructor(parentNode: Object3D, component: EventGroup) {
    super(parentNode, component);

    // Runtime type check
    if (component.type !== BoxHitGroup.type) {
      throw new Error('Invalid component type for BoxHitAlternativePainter');
    }

    this.boxComponent = component as BoxHitGroup;

    // Create a bright random color for this component collection
    const hue = Math.random();
    const randomColor = new Color().setHSL(hue, 1, 0.5); // Bright color

    // Create a material with the random color
    const material = new MeshBasicMaterial({ color: randomColor });

    // Create a mesh for each hit using the same material
    this.createHitMeshes(material);
  }

  /**
   * Creates Mesh instances for each hit and adds them to the parent node.
   *
   * @param material - The material to use for the hit meshes.
   */
  private createHitMeshes(material: MeshBasicMaterial): void {
    for (const hit of this.boxComponent.hits) {
      // Create geometry for the box
      const geometry = new BoxGeometry(10,10,10
        // hit.dimensions[0],
        // hit.dimensions[1],
        // hit.dimensions[2]
      );

      // Create the mesh
      const mesh = new Mesh(geometry, material);

      // Set position
      mesh.position.set(hit.position[0], hit.position[1], hit.position[2]);

      // Store the hit time
      mesh.userData['appearanceTime'] = hit.time[0];

      // Initially make the mesh invisible
      mesh.visible = false;

      // Add the mesh to the parent node and to the array
      this.parentNode.add(mesh);
      this.hitMeshes.push(mesh);
    }
  }

  /**
   * Paint method to update the visibility of the hits based on time.
   *
   * @param time - The current time in nanoseconds or null for static rendering.
   */
  public paint(time: number | null): void {
    for (const mesh of this.hitMeshes) {
      if (time !== null) {
        // Show the mesh if its appearance time is less than or equal to the current time
        mesh.visible = mesh.userData['appearanceTime'] <= time;
      } else {
        // In static mode, make all meshes visible
        mesh.visible = true;
      }
    }
  }

  /**
   * Dispose of resources used by the painter.
   */
  override dispose(): void {
    for (const mesh of this.hitMeshes) {
      // Dispose of geometry and material
      mesh.geometry.dispose();

      // Dispose of the material only if it's not shared with other meshes
      if (mesh.material instanceof MeshBasicMaterial) {
        mesh.material.dispose();
      }

      // Remove the mesh from the parent node
      this.parentNode.remove(mesh);
    }

    // Clear the array
    this.hitMeshes = [];

    super.dispose();
  }
}
