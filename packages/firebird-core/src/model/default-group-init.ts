import {registerEventGroupFactory} from "./event-group";
import {BoxHitGroupFactory} from "./box-hit.group";
import {PointTrajectoryGroupFactory} from "./point-trajectory.group";

/**
 * Registers the built-in event group factories (the decoders that turn DEX JSON
 * into typed EventGroup objects).
 *
 * Core has no dependency injection, so registration is an explicit call:
 * - Web workers and node scripts call this function directly.
 * - The Angular application registers factories through the `EVENT_GROUP_FACTORIES`
 *   DI token instead (see firebird-ng `provideFirebird()`); the built-in factories
 *   are contributed there the same way an extension contributes its own.
 *
 * There are intentionally no import side effects: a module that registers itself
 * at import time fights tree-shaking and hides the wiring.
 */
export function initGroupFactories() {
  registerEventGroupFactory(new BoxHitGroupFactory());
  registerEventGroupFactory(new PointTrajectoryGroupFactory());
}
