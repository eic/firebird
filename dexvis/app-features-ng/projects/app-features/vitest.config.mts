import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Specs run under Angular's JIT compiler: src/test-setup.ts loads
// @angular/compiler and initializes the TestBed environment.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
});
