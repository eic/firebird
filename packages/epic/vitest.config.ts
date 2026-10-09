import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Same one-copy-of-the-code rule as the app's tsconfig paths: resolve the
      // Firebird and dexvis packages to their sources.
      // The subpaths first: an alias key also matches '<key>/...' imports
      '@dexvis/firebird-ng/api': resolve(__dirname, '../firebird-ng/api/src/public-api.ts'),
      '@dexvis/firebird-ng/display': resolve(__dirname, '../firebird-ng/display/src/public-api.ts'),
      '@dexvis/firebird-ng/workers/geometry': resolve(__dirname, '../firebird-ng/workers/geometry/src/public-api.ts'),
      '@dexvis/firebird-ng/workers/root-file': resolve(__dirname, '../firebird-ng/workers/root-file/src/public-api.ts'),
      '@dexvis/firebird-ng/geometry-palette': resolve(__dirname, '../firebird-ng/geometry-palette/src/public-api.ts'),
      '@dexvis/firebird-ng': resolve(__dirname, '../firebird-ng/src/public-api.ts'),
      '@dexvis/app-features': resolve(__dirname, '../../dexvis/app-features-ng/projects/app-features/src/public-api.ts'),
      '@dexvis/threejs-tree-editor': resolve(__dirname, '../../dexvis/threejs-tree-editor/src/index.ts'),
      '@dexvis/root-geo-tree-editor': resolve(__dirname, '../../dexvis/root-geo-tree-editor/src/index.ts'),
      // The core subpaths before the core root, for the same reason
      '@dexvis/firebird-core/model': resolve(__dirname, '../firebird-core/src/model/index.ts'),
      '@dexvis/firebird-core/loaders': resolve(__dirname, '../firebird-core/src/loaders.ts'),
      '@dexvis/firebird-core/data-catalog': resolve(__dirname, '../firebird-core/src/data-catalog.ts'),
      '@dexvis/firebird-core': resolve(__dirname, '../firebird-core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Specs boot provideFirebird() in TestBed under Angular's JIT compiler
    setupFiles: ['src/test-setup.ts'],
  },
});
