import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // node, not jsdom: the specs open real ROOT files from disk through
    // jsroot's node file reader
    environment: 'node',
    testTimeout: 60_000,
  },
});
