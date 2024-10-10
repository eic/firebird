import { Object3D } from "three";
import { EntryComponent } from "../model/entry-component";

/** Paints all primitives for a given EntryComponent */
export abstract class ComponentPainter {

  /** Constructor is public since we can instantiate directly */
  constructor(protected node: Object3D, protected component: EntryComponent) {}

  /** Gets the `type` identifier for the component this class works with */
  public get componentType() {
    return this.component.type;
  }

  /**
   * Paints
   * @param time - time in [ns], null - draw in non-dynamic mode (all visible)
   */
  abstract paint(time: number | null): void;

  /** Dispose method to clean up resources */
  public dispose(): void {
    // Remove node from the scene
    if (this.node.parent) {
      this.node.parent.remove(this.node);
    }
    // Dispose of Three.js resources if necessary
    this.node.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    // Nullify references
    this.node = null;
    this.component = null;
  }
}
