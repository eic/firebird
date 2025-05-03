/**
 * This class is responsible in rendering Event or Frame data.
 * It first takes event components and manipulates three.js Scene
 * Then responsible for correct rendering at a given time
 */

import { Event } from "../model/event";
import { Object3D, Group } from "three";
import {EventGroupPainter, ComponentPainterConstructor} from "./event-group-painter";
import {BoxHitGroup} from "../model/box-hit.group";
import {BoxHitPainter} from "./box-hit.painter";
import {BoxHitSimplePainter} from "./box-hit-simple.painter";
import {PointTrajectoryGroup} from "../model/point-trajectory.group";
import {TrajectoryPainter} from "./trajectory.painter";

export enum DisplayMode
{
  Timed = "timed",
  Timeless = "timeless"
}

export class DataModelPainter {
  private threeParentNode: Object3D | null = null;
  private entry: Event | null = null;
  private painters: EventGroupPainter[] = [];
  // Create the registry
  componentPainterRegistry: { [type: string]: ComponentPainterConstructor } = {};

  public constructor() {
    // Register builtin painters
    //this.registerPainter(BoxHitGroup.type, BoxHitPainter);
    this.registerPainter(BoxHitGroup.type, BoxHitSimplePainter);
    this.registerPainter(PointTrajectoryGroup.type, TrajectoryPainter);

  }

  public setThreeSceneParent(parentNode: Object3D) {
    this.threeParentNode = parentNode;
  }

  public cleanupCurrentEntry() {
    for (let painter of this.painters) {
      painter.dispose();
    }
    this.painters = [];
  }

  public getEntry(): Event|null {
    return this.entry;
  }

  public setEntry(entry: Event): void {
    this.cleanupCurrentEntry();
    this.entry = entry;

    if (!this.threeParentNode) {
      throw new Error('Three.js parent node is not set.');
    }

    for (const component of entry.groups) {
      const PainterClass = this.componentPainterRegistry[component.type];
      if (PainterClass) {
        let componentGroup = new Group();
        componentGroup.name = component.name;
        componentGroup.userData['component'] = component;
        this.threeParentNode.add(componentGroup);
        const painter = new PainterClass(componentGroup, component);

        this.painters.push(painter);
      } else {
        console.warn(`No ComponentPainter registered for component type: ${component.type}`);
      }
    }
  }

  /**
   * Registers a custom painter class provided by the user.
   *
   * @param componentType - The type of the component for which the painter should be used.
   * @param painterClass - The user's custom EventGroupPainter subclass.
   */
  public registerPainter(componentType: string, painterClass: ComponentPainterConstructor): void {
    if (!componentType || !painterClass) {
      throw new Error('Both componentType and painterClass are required to register a custom painter.');
    }
    this.componentPainterRegistry[componentType] = painterClass;
  }

  /** paints scene at the current time. null - no-time mode (draws everything) */
  public paint(time: number | null): void {
    for (let painter of this.painters) {
      painter.paint(time);
    }
  }
}
