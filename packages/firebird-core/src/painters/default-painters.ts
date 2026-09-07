import {DataModelPainter} from "./data-model-painter";
import {BoxHitPiece} from "../model/box-hit.piece";
import {BoxHitSimplePainter} from "./box-hit-simple.painter";
import {PointTrajectoryPiece} from "../model/point-trajectory.piece";
import {TrajectoryPainter} from "./trajectory.painter";
import {BatchedTrajectoryPainter} from "./batched-trajectory.painter";

/**
 * Registers the built-in painters on a DataModelPainter instance.
 *
 * Mirror of model/default-piece-init.ts for the painter side: core has no DI,
 * so workers and scripts call this explicitly. The Angular application instead
 * contributes the same painters through the `PAINTERS` token (`withPainter()`),
 * proving built-ins ride the same extension surface users get.
 */
export function registerDefaultPainters(painter: DataModelPainter): void {
  painter.registerPainter(BoxHitPiece.type, BoxHitSimplePainter);
  // Registration order matters: the per-track painter registers first and
  // stays the default; the batched one is the selectable alternative
  // (painters.byPiece.<name> = trajectory-lines-batched)
  painter.registerPainter(PointTrajectoryPiece.type, TrajectoryPainter);
  painter.registerPainter(PointTrajectoryPiece.type, BatchedTrajectoryPainter);
}
