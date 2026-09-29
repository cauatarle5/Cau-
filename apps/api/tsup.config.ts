import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  // Pacotes do workspace são fonte TS: embutidos no bundle (ADR-006).
  noExternal: [/^@atlas\//],
});
