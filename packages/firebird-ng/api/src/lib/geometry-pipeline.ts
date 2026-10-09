/**
 * The extension seams of the geometry pipeline, in pipeline order:
 *
 * 1. Pre-build TGeo rules (`withRootGeometryRules`): serializable data,
 *    posted with each load request to the geometry worker, which prunes and
 *    edits the ROOT tree before jsroot builds three.js objects. The rules
 *    travel as data because the worker is a prebuilt module and cannot
 *    import pack modules.
 * 2. Themes (`withGeometryTheme`): rule sets that color, merge and outline
 *    subdetectors on the main thread, selected by `geometry.themeName`.
 * 3. Post-processors (`withGeometryPostProcessor`): main-thread code that runs
 *    once the geometry sits in the scene (scaled to mm), before the first
 *    frame shows it. May be async (an environment map needs the renderer).
 *
 * Plain TypeScript with type-only three.js imports: initial-bundle code
 * (tokens, feature functions, the config page) imports this module.
 */

import type { Type } from '@angular/core';
import type { Object3D, Plane, Scene } from 'three';
import type { ClippingGroup, WebGPURenderer } from 'three/webgpu';
import type { GeoNodeEditRule } from '@dexvis/root-geo-tree-editor';
import type { DetectorThreeRuleSet } from '@dexvis/threejs-tree-editor';
import { resolveRegistry } from '@dexvis/app-features';

// ---------------------------------------------------------------------------
// Pre-build TGeo rules
// ---------------------------------------------------------------------------

/**
 * Edit rules for one detector. The rules apply, one at a time and in order,
 * to every top-level TGeo node whose path matches the wildcard
 * `namePattern`. A top-level path is the world volume name, a slash and the
 * node name ('Default/Tracker_14'), so patterns start with a `*` segment.
 */
export interface DetectorEditRules {
  namePattern: string;
  editRules: GeoNodeEditRule[];
}

/** A named set of detector edit rules; config `geometry.rootFilterName` selects one. */
export interface RootGeometryEditRuleSet {
  /** Option text on the config page. */
  label?: string;
  detectors: DetectorEditRules[];
}

/** A named list of top-level detectors removed before the build; config `geometry.cutListName` selects one. */
export interface RootGeometryCutList {
  /** Option text on the config page. */
  label?: string;
  /** Name prefixes of top-level TGeo nodes to remove ('Beam' removes 'BeamMagnet_32'). */
  remove: string[];
}

/**
 * The edit rule set name that the data selector's "Optimize geometry" toggle
 * selects. The toggle shows only when a contribution defines this name, with
 * the rule set's label as its hint.
 */
export const OPTIMIZE_EDIT_RULE_SET = 'default';

/** What `withRootGeometryRules()` contributes. Plain data: it is posted to the geometry worker. */
export interface RootGeometryRules {
  /** Edit rule sets by name. `OPTIMIZE_EDIT_RULE_SET` ('default') is the one the data selector offers. */
  editRules?: Record<string, RootGeometryEditRuleSet>;
  /** Cut lists by name. */
  cutLists?: Record<string, RootGeometryCutList>;
}

/** Rules as data, or a dynamic import that resolves to them (keeps large rule data out of the initial bundle). */
export type RootGeometryRulesSource = RootGeometryRules | (() => Promise<RootGeometryRules>);

/** What one geometry load asks the worker to do, resolved from the config names. */
export interface RootGeometryLoadRules {
  /** Name prefixes of top-level nodes to remove; empty removes nothing. */
  cutList: string[];
  /** Detector edit rules to apply; empty edits nothing. */
  editRules: DetectorEditRules[];
}

/**
 * Merges rule contributions in registration order. A later rule set or cut
 * list with the name of an earlier one replaces it (the registry rule of
 * every Firebird extension point).
 */
export async function resolveRootGeometryRules(sources: readonly RootGeometryRulesSource[]): Promise<RootGeometryRules> {
  const resolved = await Promise.all(sources.map(source => typeof source === 'function' ? source() : source));
  const merged: Required<RootGeometryRules> = { editRules: {}, cutLists: {} };
  for (const rules of resolved) {
    Object.assign(merged.editRules, rules.editRules);
    Object.assign(merged.cutLists, rules.cutLists);
  }
  return merged;
}

/**
 * Picks what one load applies: the edit rule set and cut list named by the
 * config. 'off', and a name no contribution defines, select nothing.
 */
export function selectRootGeometryLoadRules(rules: RootGeometryRules, editRulesName: string, cutListName: string): RootGeometryLoadRules {
  return {
    editRules: rules.editRules?.[editRulesName]?.detectors ?? [],
    cutList: rules.cutLists?.[cutListName]?.remove ?? [],
  };
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

/** One geometry theme: subdetector rule sets selected by config `geometry.themeName`. */
export interface GeometryThemeRegistration {
  /** The `geometry.themeName` value that selects this theme. 'off' is reserved: no theme. */
  id: string;
  /** Option text on the config page. */
  label?: string;
  /** Resolves the rule sets. A dynamic import: rule sets carry three.js materials. */
  load: () => Promise<readonly DetectorThreeRuleSet[]>;
}

// ---------------------------------------------------------------------------
// Post-processors
// ---------------------------------------------------------------------------

/** What a geometry post-processor works on. */
export interface GeometryPostProcessContext {
  /** The loaded geometry's root object, already inside `sceneGeometry`. */
  geometry: Object3D;
  /**
   * The detector geometry container, scaled from ROOT cm to mm. Objects added
   * here render and clip like the geometry itself.
   */
  sceneGeometry: ClippingGroup;
  scene: Scene;
  /** For GPU work such as environment maps (PMREM). */
  renderer: WebGPURenderer;
  /** The main view's wedge clipping planes, for materials a processor creates. */
  clippingPlanes: Plane[];
  /** True when the user chose fast opaque materials (`geometry.FastDefaultMaterial`): skip costly effects. */
  fastMaterials: boolean;
}

/**
 * Main-thread code that adjusts a freshly loaded geometry: materials,
 * arrangement, helpers. Instantiated through a child injector, so `inject()`
 * works in its constructor.
 */
export interface GeometryPostProcessor {
  process(context: GeometryPostProcessContext): void | Promise<void>;
}

/** One post-processor registration. */
export interface GeometryPostProcessorRegistration {
  /** Identity: a later registration with this id replaces this one. */
  id: string;
  /** Ids of post-processors that must run before this one. Ids nobody registered are ignored. */
  after?: string[];
  /** Resolves the class. A dynamic import: post-processors usually pull three.js. */
  load: () => Promise<Type<GeometryPostProcessor>>;
}

/**
 * The run order of post-processors: registration order, except that each
 * runs after the ids in its `after`. Same-id registrations replace earlier
 * ones in place first.
 *
 * @throws Error naming the processors when the `after` constraints form a cycle.
 */
export function orderGeometryPostProcessors(
  registrations: readonly GeometryPostProcessorRegistration[],
): GeometryPostProcessorRegistration[] {
  const pending = resolveRegistry(registrations, registration => registration.id);
  const known = new Set(pending.map(registration => registration.id));
  const ordered: GeometryPostProcessorRegistration[] = [];
  const placed = new Set<string>();
  while (pending.length > 0) {
    // The first registration whose predecessors are all placed goes next
    const index = pending.findIndex(registration =>
      (registration.after ?? []).every(id => placed.has(id) || !known.has(id)));
    if (index < 0) {
      throw new Error(`Geometry post-processors wait for each other: ${pending.map(registration => registration.id).join(', ')}`);
    }
    const [next] = pending.splice(index, 1);
    ordered.push(next);
    placed.add(next.id);
  }
  return ordered;
}
