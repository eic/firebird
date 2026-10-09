/**
 * The ePIC experiment pack: everything Firebird knows about the ePIC
 * detector, contributed through the public extension API. The flagship app
 * installs it with `provideFirebird(withEpic({...}))`; an installation for
 * another experiment leaves it out and writes its own pack the same way.
 *
 * Heavy parts (geometry rules, themes, post-processors, the collision intro)
 * load through dynamic imports: an application references this file from its
 * app.config.ts, so everything it imports statically lands in the initial
 * bundle.
 */

import {
  FirebirdFeature,
  firebirdPack,
  withCameraLimits,
  withCameraPreset,
  withCollisionIntro,
  withConfigDefaults,
  withDefaultGeometry,
  withGeometryPostProcessor,
  withGeometryTheme,
  withRootGeometryRules,
  withToolbarAction,
  withUrlAlias,
} from '@dexvis/firebird-ng';
import { withEpicDataCatalog } from './epic-data-catalog';

/**
 * Options of `withEpic()`. Each option sets a config DEFAULT, the lowest
 * precedence tier: server config.jsonc, a value the user saved on the config
 * page, and a `?config.<key>=` URL value override it.
 */
export interface EpicOptions {
  /**
   * URL of the geometry shown when nothing else selects one (config key
   * `geometry.selectedGeometry`); `epic://` URLs work. Default: the full ePIC
   * detector, `https://seeeic.org/g/epic/artifacts/tgeo/epic_craterlake.root`.
   */
  geometry?: string;
}

const EPIC_ARTIFACTS = 'https://seeeic.org/g/epic/artifacts/';

/**
 * The ePIC pack as one feature with the id `epic`: the `epic://` alias, the
 * ePIC datasets of the data selector, TGeo cleanup rules and cut lists, the
 * cool2, cool2no and cad geometry themes, the dRICH mirror and detector
 * grouping post-processors, the Cherenkov collections kept out of MC-truth
 * trajectories, the ePIC camera views and limits, and the collision intro
 * with its toolbar button. Installed twice, it takes effect once: the later
 * call replaces the earlier one at the earlier position.
 *
 * ```ts
 * provideFirebird(withEpic({ geometry: 'epic://tgeo/epic_ip6.root' }))
 * ```
 */
export function withEpic(options: EpicOptions = {}): FirebirdFeature {
  return firebirdPack('epic',
    // Where data lives. The default geometry is the URL the catalog's
    // full-detector entries use, so a fresh install shows that preset as the
    // active one.
    withUrlAlias('epic://', EPIC_ARTIFACTS),
    withDefaultGeometry(options.geometry ?? `${EPIC_ARTIFACTS}tgeo/epic_craterlake.root`),
    withEpicDataCatalog(),

    // Geometry pipeline: TGeo cleanup and cut lists, themes, post-processing.
    // The pack selects its rule set and theme through config defaults, so a
    // user's choice on the config page still overrides them.
    withConfigDefaults({
      'geometry.rootFilterName': 'default',
      'geometry.themeName': 'cool2',
    }),
    withRootGeometryRules(() => import('./epic-geometry-rules').then(m => m.epicRootGeometryRules)),
    withGeometryTheme({
      id: 'cool2', label: 'Cool2 - modern colors by detector type',
      load: () => import('./cool2-geometry-ruleset').then(m => m.cool2ColorRules),
    }),
    withGeometryTheme({
      id: 'cool2no', label: 'Cool2 No Outline - no outline for performance',
      load: () => import('./cool2no-geometry-ruleset').then(m => m.cool2NoOutlineColorRules),
    }),
    withGeometryTheme({
      id: 'cad', label: 'CAD - like colors, optimized',
      load: () => import('./cad-geometry-ruleset').then(m => m.cadColorRules),
    }),
    withGeometryPostProcessor({
      id: 'epic.prettifier',
      load: () => import('./epic-geometry-post-processors').then(m => m.EpicGeometryPrettifier),
    }),
    withGeometryPostProcessor({
      id: 'epic.arranger',
      load: () => import('./epic-geometry-post-processors').then(m => m.EpicDetectorArranger),
    }),

    // Event conversion: the DIRC, dRICH and pfRICH sim hits are photon
    // detections attributed to the emitting charged particle. Joined into
    // that particle's MC-truth trajectory, they draw zigzags along the
    // photosensor planes, so the browser conversion keeps them out of the
    // trajectories (they still show as hits). pyrobird's server conversion
    // excludes the same list by default.
    withConfigDefaults({
      'events.trajectoryExcludedCollections': 'DIRCBarHits,DRICHHits,PFRICHHits',
    }),

    // Camera: the ePIC views, and limits sized for the ePIC hall (a 15 m
    // scene radius) instead of the loaded geometry's bounding sphere.
    withCameraLimits({ minDistance: 750, maxDistance: 75000 }),
    withCameraPreset({ name: 'home', label: 'Home', position: [0, 7000, 0], target: [0, 0, 0], up: [1, 0, 0] }),
    withCameraPreset({ name: 'center', label: 'Center', position: [-3600, 2900, -4700], target: [0, 0, 0], up: [0, 1, 0] }),
    withCameraPreset({ name: 'farforward', label: 'Far forward', position: [8000, 7500, 40000], target: [0, 0, 30000], up: [0, 1, 0] }),

    // The beams colliding before an event plays, and its toolbar button
    withCollisionIntro(() => import('./epic-collision-intro').then(m => m.EpicCollisionIntro)),
    withToolbarAction({
      id: 'collision', icon: 'close_fullscreen', label: 'Collision',
      tooltip: 'Animate with beam particles collision',
      command: { type: 'animate-collision' },
    }),
  );
}
