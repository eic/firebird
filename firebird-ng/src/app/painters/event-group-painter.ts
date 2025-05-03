import { Object3D } from "three";
import { EventGroup } from "../model/event-group";
import {disposeNode} from "../utils/three.utils";


/** Define the type for the constructor of EventGroupPainter subclasses */
export type ComponentPainterConstructor = new (node: Object3D, component: EventGroup) => EventGroupPainter;

/** Paints all primitives for a given EventGroup */
export abstract class EventGroupPainter {

  /** Constructor is public since we can instantiate directly */
  constructor(protected parentNode: Object3D, protected component: EventGroup) {}

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
