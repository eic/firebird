import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

// One build config, byte-identical in every plain-TypeScript library that
// uses it. What differs between packages lives in their package.json.

type ExportTarget = string | { types?: string; default?: string };

/**
 * The build entries, read from the package's own "exports" map. The dist
 * tree mirrors src: a subpath exported as `./dist/<path>.js` builds from
 * `src/<path>.ts` (`.` is `./dist/index.js` from `src/index.ts`, `./model` may
 * be `./dist/model/index.js` from `src/model/index.ts`). A package adds a
 * subpath by adding it to "exports"; code shared between entries lands in
 * chunks, so a class stays one class whichever subpath imports it.
 */
function entriesFromExports(): Record<string, string> {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const entries: Record<string, string> = {};
  for (const [subpath, target] of Object.entries(packageJson.exports as Record<string, ExportTarget>)) {
    const runtime = typeof target === 'string' ? target : target.default;
    const name = runtime?.match(/^\.\/dist\/(.+)\.js$/)?.[1];
    if (!name) {
      throw new Error(`package.json exports '${subpath}': expected "./dist/<path>.js", got ${JSON.stringify(runtime)}`);
    }
    if (typeof target !== 'string' && target.types !== `./dist/${name}.d.ts`) {
      throw new Error(`package.json exports '${subpath}': "types" must be "./dist/${name}.d.ts"`);
    }
    entries[name] = `src/${name}.ts`;
  }
  return entries;
}

export default defineConfig({
  entry: entriesFromExports(),
  // A browser library: 'neutral' adds no runtime-specific handling and keeps
  // the output extension tied to package.json "type" (index.js, index.d.ts)
  // instead of the platform-'node' default (.mjs, .d.mts).
  platform: 'neutral',
  sourcemap: true,
  // One bundled .d.ts per entry. No declaration maps: they point into src/,
  // which the package does not ship.
  dts: { sourcemap: false },
});
