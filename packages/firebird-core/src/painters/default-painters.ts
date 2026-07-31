import {DataModelPainter} from "./data-model-painter";
import {BoxHitGroup} from "../model/box-hit.group";
import {BoxHitSimplePainter} from "./box-hit-simple.painter";
import {PointTrajectoryGroup} from "../model/point-trajectory.group";
import {TrajectoryPainter} from "./trajectory.painter";

/**
 * Registers the built-in painters on a DataModelPainter instance.
 *
 * Mirror of model/default-group-init.ts for the painter side: core has no DI,
 * so workers and scripts call this explicitly. The Angular application instead
 * contributes the same painters through the `PAINTERS` token (`withPainter()`),
 * proving built-ins ride the same extension surface users get.
 */
export function registerDefaultPainters(painter: DataModelPainter): void {
  painter.registerPainter(BoxHitGroup.type, BoxHitSimplePainter);
  painter.registerPainter(PointTrajectoryGroup.type, TrajectoryPainter);
}
