import { Entry } from "../model/entry";
import { Object3D, Group } from "three";
import {ComponentPainter, ComponentPainterConstructor} from "./component-painter";
import {BoxTrackerHitComponent} from "../model/box-tracker-hit.component";
import {BoxTrackerHitPainter} from "./box-tracker-hit.painter";


export class DataModelPainter {
  private threeParentNode: Object3D | null = null;
  private entry: Entry | null = null;
  private painters: ComponentPainter[] = [];
  // Create the registry
  componentPainterRegistry: { [type: string]: ComponentPainterConstructor } = {};

  public constructor() {
    // Register builtin painters
    this.registerPainter(BoxTrackerHitComponent.type, BoxTrackerHitPainter);

  }

  public setThreeSceneParent(parentNode: Object3D) {
    this.threeParentNode = parentNode;
  }

  protected cleanupCurrentEntry() {
    for (let painter of this.painters) {
      painter.dispose();
    }
    this.painters = [];
  }

  public setEntry(entry: Entry): void {
    this.cleanupCurrentEntry();
    this.entry = entry;

    if (!this.threeParentNode) {
      throw new Error('Three.js parent node is not set.');
    }

    for (const component of entry.components) {
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
   * @param painterClass - The user's custom ComponentPainter subclass.
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
