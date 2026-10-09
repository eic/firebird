/**
 * firebird-core must work with no Angular injector and no bootstrap - the
 * geometry-loader web worker runs this code, and workers have no DI (event
 * parsing is expected to move off the main thread the same way). This spec
 * is the enforced form of that constraint, in two parts:
 * - it parses a DEX file and paints it into a bare three.js Scene using only
 *   core classes, so a dependency that needs an injector at run time fails;
 * - it scans every non-spec source file for Angular DI and component APIs
 *   (InjectionToken, Injectable, inject(), HttpClient, component decorators),
 *   so a statically present token fails even when no code path runs it.
 * Angular signals (`signal`, `Signal`, `computed`) stay allowed: they work
 * without an injector.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Scene } from 'three';
import { DataExchange, DataModelPainter, initPieceFactories, registerDefaultPainters } from './index';

const DEX_SAMPLE = {
  type: 'firebird-dex-json',
  version: '1.0',
  origin: { by: 'no-injector.spec' },
  events: [
    {
      id: 'event_0',
      pieces: [
        {
          name: 'TestHits',
          type: 'BoxHit',
          version: '1.0',
          origin: { by: 'spec' },
          count: 2,
          columns: {
            pos: [10, 20, 30, 40, 50, 60],
            dim: [1, 1, 1, 2, 2, 2],
            time: [0, 5],
            edep: [0.001, 0.002],
          },
        },
        {
          name: 'TestTracks',
          type: 'PointTrajectory',
          version: '1.0',
          origin: { by: 'spec' },
          count: 1,
          columns: { theta: [0.5] },
          pointColumns: ['x', 'y', 'z', 't'],
          points: [
            [[0, 0, 0, 0], [10, 10, 10, 1], [20, 15, 30, 2]],
          ],
        },
      ],
    },
  ],
};

describe('firebird-core without an injector', () => {
  it('parses DEX and paints an event into a bare Scene', () => {
    // Registration is explicit — no import side effects, no DI (this is how
    // the workers wire core; the Angular app wires the same classes via tokens).
    initPieceFactories();

    const dex = DataExchange.fromDexObj(DEX_SAMPLE);
    expect(dex.events.length).toBe(1);
    expect(dex.events[0].pieces.length).toBe(2);

    const scene = new Scene();
    const painter = new DataModelPainter();
    registerDefaultPainters(painter);
    painter.setThreeSceneParent(scene);
    painter.setEntry(dex.events[0]);
    painter.paint(null);

    // The painter must have created three.js objects under the scene.
    let meshCount = 0;
    scene.traverse(() => meshCount++);
    expect(meshCount).toBeGreaterThan(2);

    // Time filtering runs without any framework machinery either.
    painter.paint(1.5);
  });
});

// Angular APIs that need an injector or a compiled component, with the name
// the scan reports for each.
const FORBIDDEN_APIS: ReadonlyArray<readonly [string, RegExp]> = [
  ['InjectionToken', /\bInjectionToken\b/],
  ['Injectable', /\bInjectable\b/],
  ['inject()', /\binject\s*\(/],
  ['HttpClient', /\bHttpClient\b/],
  ['component decorator', /@(?:Component|Directive|Pipe|NgModule)\s*\(/],
];

/** Removes comments, so prose that names a forbidden API does not count. Keeps `://` in URLs. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Names of the forbidden APIs that a TypeScript source uses outside comments. */
function findForbiddenApis(source: string): string[] {
  const code = stripComments(source);
  return FORBIDDEN_APIS.filter(([, pattern]) => pattern.test(code)).map(([name]) => name);
}

/** Every non-spec .ts file under `dir`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('firebird-core source scan', () => {
  // vitest defines __dirname for spec modules; the jsdom environment's
  // import.meta.url is not a file: URL.
  const srcDir = __dirname;
  const files = sourceFiles(srcDir);

  it('finds the package sources', () => {
    // Guards against a vacuous pass when the directory walk finds nothing.
    expect(files.length).toBeGreaterThan(10);
    expect(files.map(file => relative(srcDir, file))).toContain('index.ts');
  });

  it('uses no Angular DI, HttpClient or component API', () => {
    const offenders = files.flatMap(file =>
      findForbiddenApis(readFileSync(file, 'utf8')).map(api => `${relative(srcDir, file)}: ${api}`));
    expect(offenders).toEqual([]);
  });

  it('detects each forbidden API and allows signals and comments', () => {
    expect(findForbiddenApis("import { InjectionToken } from '@angular/core';")).toEqual(['InjectionToken']);
    expect(findForbiddenApis("@Injectable({ providedIn: 'root' }) export class S {}")).toEqual(['Injectable']);
    expect(findForbiddenApis('const http = inject(HttpClient);')).toEqual(['inject()', 'HttpClient']);
    expect(findForbiddenApis('@Component({ template: "" }) export class C {}')).toEqual(['component decorator']);
    expect(findForbiddenApis("import { Signal, computed, signal } from '@angular/core';")).toEqual([]);
    expect(findForbiddenApis('// @Injectable, inject(), HttpClient\n/* InjectionToken */')).toEqual([]);
    expect(findForbiddenApis("const url = 'https://example.org'; const t = new InjectionToken('t');"))
      .toEqual(['InjectionToken']);
  });
});
