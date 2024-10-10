import { Object3D, Object3DEventMap} from "three";
import {EntryComponent} from "../model/entry-component";
import {ComponentPainter, ComponentPainterFactory} from "./component-painter";
import {BoxTrackerHitComponent} from "../model/box-tracker-hit.component";

export class BoxHitPainter extends ComponentPainter {

  override paint(time: number | null): void {
    throw new Error("Method not implemented.");
  }
}

export class BoxHitPainterFactory implements ComponentPainterFactory {
    public get componentType(): string {
      return BoxTrackerHitComponent.type;
    }

    fromComponent(node: Object3D<Object3DEventMap>, component: EntryComponent): ComponentPainter {
        throw new Error("Method not implemented.");
    }

}
