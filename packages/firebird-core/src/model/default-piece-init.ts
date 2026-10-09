import {registerEventPieceFactory} from "./event-piece";
import {BoxHitPieceFactory} from "./box-hit.piece";
import {PointTrajectoryPieceFactory} from "./point-trajectory.piece";

/**
 * Registers the built-in event piece factories (the decoders that turn DEX JSON
 * into typed EventPiece objects).
 *
 * Core has no dependency injection, so registration is an explicit call:
 * - Web workers and node scripts call this function directly.
 * - The Angular application registers factories through the `EVENT_PIECE_FACTORIES`
 *   DI token instead (see firebird-ng `provideFirebird()`); the built-in factories
 *   are contributed there the same way an extension contributes its own.
 *
 * There are intentionally no import side effects: a module that registers itself
 * at import time fights tree-shaking and hides the wiring.
 */
export function initPieceFactories() {
  registerEventPieceFactory(new BoxHitPieceFactory());
  registerEventPieceFactory(new PointTrajectoryPieceFactory());
}
