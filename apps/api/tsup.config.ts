import { defineConfig } from 'tsup';

export default defineConfig({
  // `release`: migrations + catálogos antes da API subir (ADR-058).
  entry: { server: 'src/server.ts', release: 'scripts/release.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  // Pacotes do workspace são fonte TS: embutidos no bundle (ADR-006).
  noExternal: [/^@atlas\//],
});
