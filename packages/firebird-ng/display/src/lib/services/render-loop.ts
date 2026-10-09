/**
 * Render-loop decisions, kept free of renderer state so specs can pin them.
 * ThreeService.renderLoop calls these once per animation frame.
 */

/** The per-view state the frame decision reads. */
export interface DirtyFlag {
  dirty: boolean;
}

/**
 * Whether this animation frame renders. Continuous mode renders every
 * frame; on-demand mode renders only when something set a dirty flag since
 * the last rendered frame: `invalidate()` (all views), controls 'change',
 * or a per-view knob. One dirty view renders a frame that repaints ALL
 * views (see ThreeService.renderLoop for why).
 */
export function shouldRenderFrame(continuous: boolean, renderRequested: boolean, views: readonly DirtyFlag[]): boolean {
  return continuous || renderRequested || views.some(view => view.dirty);
}

/**
 * Calls `invoke` for each target and isolates failures: a target that
 * throws is reported through `onError` and does not stop the remaining
 * targets. Returns the targets that threw, so the caller can disable them
 * (a hook that throws once usually throws on every frame).
 */
export function runIsolated<T>(
  targets: readonly T[],
  invoke: (target: T) => void,
  onError: (target: T, error: unknown) => void,
): T[] {
  const failed: T[] = [];
  for (const target of targets) {
    try {
      invoke(target);
    } catch (error) {
      failed.push(target);
      onError(target, error);
    }
  }
  return failed;
}
