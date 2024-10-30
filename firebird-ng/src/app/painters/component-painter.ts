import { Object3D } from "three";
import { EntryComponent } from "../model/entry-component";
import {disposeNode} from "../utils/three.utils";


/** Define the type for the constructor of ComponentPainter subclasses */
export type ComponentPainterConstructor = new (node: Object3D, component: EntryComponent) => ComponentPainter;

/** Paints all primitives for a given EntryComponent */
export abstract class ComponentPainter {

  /** Constructor is public since we can instantiate directly */
  constructor(protected parentNode: Object3D, protected component: EntryComponent) {}

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
    if (this.parentNode) {
      disposeNode(this.parentNode);
    }
  }
}
