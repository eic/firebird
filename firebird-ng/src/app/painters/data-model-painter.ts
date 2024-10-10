import {ThreeService} from "../services/three.service";
import {Entry} from "../model/entry";
import {Object3D} from "three";
import {ComponentPainter, ComponentPainterFactoryRegistry} from "./component-painter";

export class DataModelPainter {
  private threeParentNode: Object3D|null = null;
  private entry: Entry|null = null;
  private painterRegistry = new ComponentPainterFactoryRegistry();
  private painters: ComponentPainter[] = []

  public constructor() {
  }

  public setThreeSceneParent(parentNode: Object3D) {
    this.threeParentNode = parentNode;
  }

  protected cleanupCurrentEntry() {
    this.painters = []
  }

  public setEntry(entry: Entry): void {
    for(const component of entry.components) {
      component.type
    }

  }

  public paint(time: number|null): void {

  }
}


