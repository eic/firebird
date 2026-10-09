import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Same one-copy-of-the-code rule as the app's tsconfig paths: resolve the
      // Firebird and dexvis packages to their sources.
      '@dexvis/threejs-tree-editor': resolve(__dirname, '../../dexvis/threejs-tree-editor/src/index.ts'),
      '@dexvis/root-geo-tree-editor': resolve(__dirname, '../../dexvis/root-geo-tree-editor/src/index.ts'),
      // The core subpaths first: an alias key also matches '<key>/...' imports
      '@dexvis/firebird-core/model': resolve(__dirname, '../firebird-core/src/model/index.ts'),
      '@dexvis/firebird-core': resolve(__dirname, '../firebird-core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
});
