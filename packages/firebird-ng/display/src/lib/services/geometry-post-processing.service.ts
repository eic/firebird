import { Injectable, Injector, inject } from '@angular/core';
import {
  GEOMETRY_POST_PROCESSORS,
  GeometryPostProcessContext,
  GeometryPostProcessor,
  orderGeometryPostProcessors,
} from '@dexvis/firebird-ng/api';

/** A post-processor that could not run, with the reason. */
export interface GeometryPostProcessFailure {
  id: string;
  error: unknown;
}

/**
 * Runs the registered geometry post-processors (`withGeometryPostProcessor`)
 * on a freshly loaded geometry, in their declared order. Each processor
 * class loads on the first geometry load and is instantiated once, through a
 * child injector so `inject()` works in its constructor.
 *
 * A failing processor does not stop the others or the load: the geometry
 * shows without that processor's changes, and the failure is returned for
 * the caller to report.
 */
@Injectable({ providedIn: 'root' })
export class GeometryPostProcessingService {
  private readonly injector = inject(Injector);
  private readonly registrations = inject(GEOMETRY_POST_PROCESSORS, { optional: true }) ?? [];
  private processors: Promise<Array<{ id: string; processor: GeometryPostProcessor | null; error?: unknown }>> | null = null;

  /** Runs every processor on `context`; resolves with the failures. */
  async process(context: GeometryPostProcessContext): Promise<GeometryPostProcessFailure[]> {
    const failures: GeometryPostProcessFailure[] = [];
    for (const { id, processor, error } of await this.resolveProcessors()) {
      if (!processor) {
        failures.push({ id, error });
        continue;
      }
      try {
        await processor.process(context);
      } catch (processError) {
        failures.push({ id, error: processError });
      }
    }
    return failures;
  }

  private resolveProcessors() {
    this.processors ??= (async () => {
      // An `after` cycle is a registration mistake: report it once per
      // processor and run none of them instead of guessing an order
      let ordered;
      try {
        ordered = orderGeometryPostProcessors(this.registrations);
      } catch (error) {
        return this.registrations.map(registration => ({ id: registration.id, processor: null, error }));
      }
      return Promise.all(ordered.map(async registration => {
        try {
          const processorClass = await registration.load();
          const child = Injector.create({ providers: [processorClass], parent: this.injector });
          return { id: registration.id, processor: child.get(processorClass) };
        } catch (error) {
          return { id: registration.id, processor: null, error };
        }
      }));
    })();
    return this.processors;
  }
}
