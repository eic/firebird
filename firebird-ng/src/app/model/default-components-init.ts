import {registerComponentFactory} from "./entry-component";
import {TrackerLinePointTrajectoryComponentFactory} from "./point-trajectory.event-component";

/**
 * Initializes and registers the default event blocks-components.
 *
 * In Angular, files that contain only side-effectful calls like
 * `registerComponentFactory(...)` can be tree-shaken out if they are never imported directly.
 * By putting the registration inside this function, and explicitly calling it
 * in a known place (e.g., `app.module.ts` or another main entry point), we ensure
 * that the factory is actually registered at runtime.
 *
 * This approach lets us control when the registration happens, rather than
 * relying on top-level imports that might be removed by the bundler
 * if not referenced elsewhere. Any other factories that need to be registered
 * can be placed in here or in a similar init function.
 */
export function initComponentFactories() {
  registerComponentFactory(new TrackerLinePointTrajectoryComponentFactory());
}
