import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Same one-copy-of-the-code rule as the app's tsconfig paths: resolve the
      // dexvis packages to their submodule sources, not built dist.
      '@dexvis/threejs-tree-editor': resolve(__dirname, '../../dexvis/threejs-tree-editor/src/index.ts'),
      '@dexvis/root-geo-tree-editor': resolve(__dirname, '../../dexvis/root-geo-tree-editor/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
});
