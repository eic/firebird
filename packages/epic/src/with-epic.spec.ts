/**
 * The ePIC pack through the public extension API: what it contributes to
 * each registry, that its options are config defaults every other source
 * overrides, that installing it twice installs it once, and that its
 * pre-build rules survive the trip to the geometry worker (structured clone).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ApplicationInitStatus, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Group, Mesh } from 'three';
import {
  type AppFeatureInput,
  CAMERA_LIMITS,
  COLLISION_INTRO,
  ConfigService,
  DATA_CATALOGS,
  GEOMETRY_POST_PROCESSORS,
  GEOMETRY_ROOT_FILTER_CONFIG,
  GEOMETRY_THEME_CONFIG,
  GEOMETRY_THEMES,
  GEOMETRY_URL_CONFIG,
  ROOT_GEOMETRY_RULES,
  TRAJECTORY_EXCLUDED_COLLECTIONS_CONFIG,
  URL_ALIASES,
  injectCameraPresets,
  injectToolbarActions,
  provideFirebird,
  resolveRootGeometryRules,
  selectRootGeometryLoadRules,
  withoutFeatures,
} from '@dexvis/firebird-ng';
import { EpicOptions, withEpic } from './with-epic';
import { EpicCollisionIntro } from './epic-collision-intro';

const CRATERLAKE = 'https://seeeic.org/g/epic/artifacts/tgeo/epic_craterlake.root';

/**
 * Boots provideFirebird() with the given features, answers the server config
 * request with `serverFile`, and waits for the app initializers.
 */
async function boot(features: AppFeatureInput[], serverFile: object = {}): Promise<void> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideFirebird(...features),
    ],
  });
  const initStatus = TestBed.inject(ApplicationInitStatus);
  TestBed.inject(HttpTestingController).expectOne('assets/config.jsonc').flush(JSON.stringify(serverFile));
  await initStatus.donePromise;
}

function bootEpic(options?: EpicOptions, ...extraFeatures: AppFeatureInput[]): Promise<void> {
  return boot([withEpic(options), ...extraFeatures]);
}

function configValue(schema: typeof GEOMETRY_URL_CONFIG): string {
  return TestBed.inject(ConfigService).declare(schema).value;
}

describe('withEpic', () => {
  const originalUrl = window.location.href;

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    window.history.replaceState(null, '', originalUrl);
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('points epic:// at the ePIC artifacts on seeeic.org and selects the ePIC pipeline by default', async () => {
    await bootEpic();
    expect(TestBed.inject(URL_ALIASES)).toContainEqual({ prefix: 'epic://', base: 'https://seeeic.org/g/epic/artifacts/' });
    expect(configValue(GEOMETRY_THEME_CONFIG)).toBe('cool2');
    expect(configValue(GEOMETRY_ROOT_FILTER_CONFIG)).toBe('default');
    expect(configValue(GEOMETRY_URL_CONFIG)).toBe(CRATERLAKE);
  });

  it('keeps the Cherenkov sim hits out of MC-truth trajectories, as pyrobird does', async () => {
    await bootEpic();
    expect(configValue(TRAJECTORY_EXCLUDED_COLLECTIONS_CONFIG)).toBe('DIRCBarHits,DRICHHits,PFRICHHits');
  });

  it('takes the default geometry as an option', async () => {
    await bootEpic({ geometry: 'epic://tgeo/epic_ip6.root' });
    expect(configValue(GEOMETRY_URL_CONFIG)).toBe('epic://tgeo/epic_ip6.root');
  });

  describe('options are defaults: every other config source overrides them', () => {
    const option = 'epic://tgeo/epic_ip6.root';

    it('server config.jsonc', async () => {
      await boot([withEpic({ geometry: option })], {
        userConfigs: { 'geometry.selectedGeometry': 'https://server/detector.root', 'geometry.themeName': 'grey' },
      });
      expect(configValue(GEOMETRY_URL_CONFIG)).toBe('https://server/detector.root');
      expect(configValue(GEOMETRY_THEME_CONFIG)).toBe('grey');
    });

    it('a value the user saved', async () => {
      localStorage.setItem('geometry.selectedGeometry', 'https://saved/detector.root');
      await bootEpic({ geometry: option });
      expect(configValue(GEOMETRY_URL_CONFIG)).toBe('https://saved/detector.root');
    });

    it('a ?config. URL value', async () => {
      window.history.replaceState(null, '', '/?config.geometry.selectedGeometry=https://link/detector.root&config.geometry.themeName=grey');
      await bootEpic({ geometry: option });
      expect(configValue(GEOMETRY_URL_CONFIG)).toBe('https://link/detector.root');
      expect(configValue(GEOMETRY_THEME_CONFIG)).toBe('grey');
    });
  });

  it('registers its themes, post-processors, camera views and limits, intro and toolbar action', async () => {
    await bootEpic();
    expect(TestBed.inject(GEOMETRY_THEMES).map(theme => theme.id)).toEqual(['grey', 'cool2', 'cool2no', 'cad']);
    expect(TestBed.inject(GEOMETRY_POST_PROCESSORS).map(processor => processor.id)).toEqual(['epic.prettifier', 'epic.arranger']);
    expect(TestBed.inject(CAMERA_LIMITS)).toEqual({ minDistance: 750, maxDistance: 75000 });
    const presets = TestBed.runInInjectionContext(() => injectCameraPresets());
    expect(presets.find(preset => preset.name === 'home')).toEqual(
      expect.objectContaining({ position: [0, 7000, 0], target: [0, 0, 0], up: [1, 0, 0] }));
    expect(presets.map(preset => preset.name)).toEqual(expect.arrayContaining(['center', 'farforward']));
    expect(TestBed.runInInjectionContext(() => injectToolbarActions())).toEqual([
      expect.objectContaining({ id: 'collision', icon: 'close_fullscreen', command: { type: 'animate-collision' } }),
    ]);
    expect(await TestBed.inject(COLLISION_INTRO)()).toBe(EpicCollisionIntro);
  });

  it('offers the ePIC datasets: remote samples as DEX 1.0 files on seeeic.org/d, bundled samples as assets', async () => {
    await bootEpic();
    const [catalog] = TestBed.inject(DATA_CATALOGS);
    const eventUrls = (catalog.entries ?? []).map(entry => entry.events).filter((url): url is string => !!url);
    const remote = eventUrls.filter(url => url.startsWith('https://'));
    expect(remote.length).toBe(8);
    for (const url of remote) {
      expect(url).toMatch(/^https:\/\/seeeic\.org\/d\/[\w.-]+\.v1\.firebird\.zip$/);
    }
    expect(eventUrls.filter(url => url.startsWith('asset://')).length).toBe(9);
    expect(catalog.entries?.[0]).toEqual(expect.objectContaining({ geometry: CRATERLAKE }));
  });

  it('takes effect once when an application installs it twice: the later call wins, nothing is duplicated', async () => {
    const warn = vi.spyOn(console, 'warn');
    await boot([withEpic(), withEpic({ geometry: 'epic://tgeo/epic_ip6.root' })]);
    expect(configValue(GEOMETRY_URL_CONFIG)).toBe('epic://tgeo/epic_ip6.root');
    expect(TestBed.inject(URL_ALIASES).filter(alias => alias.prefix === 'epic://').length).toBe(1);
    expect(TestBed.inject(DATA_CATALOGS).length).toBe(1);
    expect(TestBed.inject(GEOMETRY_THEMES).map(theme => theme.id)).toEqual(['grey', 'cool2', 'cool2no', 'cad']);
    expect(TestBed.inject(GEOMETRY_POST_PROCESSORS).length).toBe(2);
    const presetNames = TestBed.runInInjectionContext(() => injectCameraPresets()).map(preset => preset.name);
    expect(presetNames.length).toBe(new Set(presetNames).size);
    expect(TestBed.runInInjectionContext(() => injectToolbarActions()).length).toBe(1);
    expect(warn.mock.calls.flat().join('\n')).not.toMatch(/\[AppFeatures\]|\[Firebird\]/);
  });

  it('leaves the generic built-ins in effect when an application drops the pack', async () => {
    await bootEpic(undefined, withoutFeatures('epic'));
    expect(TestBed.inject(URL_ALIASES, null) ?? []).not.toContainEqual(expect.objectContaining({ prefix: 'epic://' }));
    expect(configValue(GEOMETRY_THEME_CONFIG)).toBe('off');
    expect(configValue(TRAJECTORY_EXCLUDED_COLLECTIONS_CONFIG)).toBe('');
    const home = TestBed.runInInjectionContext(() => injectCameraPresets().find(preset => preset.name === 'home'));
    expect(home).toEqual({ name: 'home', direction: [0, 1, 0], up: [1, 0, 0], fitGeometry: true });
    expect(TestBed.inject(CAMERA_LIMITS, null)).toBeNull();
    expect(TestBed.runInInjectionContext(() => injectToolbarActions())).toEqual([]);
  });

  it('ships pre-build rules that survive the structured clone to the worker', async () => {
    await bootEpic();
    const rules = await resolveRootGeometryRules(TestBed.inject(ROOT_GEOMETRY_RULES));
    const selected = selectRootGeometryLoadRules(rules, 'default', 'central');
    expect(selected.editRules.length).toBe(15);
    expect(selected.cutList).toContain('Lumi');
    expect(structuredClone(selected)).toEqual(selected);
  });
});

describe('EpicCollisionIntro', () => {
  it('flies the beams in from +-5 m, fades them in over 300 ms, and disposes them at the end', () => {
    const intro = new EpicCollisionIntro();
    const parent = new Group();
    intro.begin(parent);
    const [electron, ion] = parent.children as Mesh[];
    expect([electron.position.z, ion.position.z]).toEqual([5000, -5000]);

    intro.update(150);
    expect((electron.material as { opacity: number }).opacity).toBeCloseTo(0.5);
    intro.update(500);
    expect([electron.position.z, ion.position.z]).toEqual([2500, -2500]);
    intro.update(1000);
    expect([electron.position.z + 0, ion.position.z + 0]).toEqual([0, 0]);

    intro.end();
    expect(parent.children).toEqual([]);
  });
});
