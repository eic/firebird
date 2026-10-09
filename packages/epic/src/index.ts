/**
 * @dexvis/firebird-epic: Firebird's support for the ePIC detector at the
 * Electron-Ion Collider, as one feature pack.
 *
 * ```ts
 * provideFirebird(withEpic({ geometry: 'epic://tgeo/epic_craterlake.root' }))
 * ```
 *
 * Rule data, themes, post-processors and the collision intro load through
 * dynamic imports from `withEpic()`: they pull three.js and stay out of the
 * application's initial bundle.
 */

export { withEpic } from './with-epic';
export type { EpicOptions } from './with-epic';
