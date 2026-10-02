import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:3001';
// API Fastify dentro do Next (Vercel, ADR-064): `/api/v1/*` vai para `pages/api/v1/[...path]`.
const embeddedApi = process.env.EMBEDDED_API === 'true';

const nextConfig: NextConfig = {
  transpilePackages: ['@atlas/core', '@atlas/schemas', '@atlas/db', '@atlas/ai', '@atlas/api'],
  // Dependências nativas ou com carregamento dinâmico ficam fora do bundle do servidor.
  serverExternalPackages: ['pg', 'pg-boss', '@node-rs/argon2'],
  // O navegador só fala com este origin; a API recebe via proxy (ADR-007).
  // Imagem Docker enxuta (ADR-058): `NEXT_OUTPUT=standalone` no build da imagem; `next start` no
  // resto. A raiz do monorepo entra no rastreamento dos pacotes.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  headers() {
    return Promise.resolve([
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]);
  },
  rewrites() {
    if (embeddedApi) return Promise.resolve([]);
    return Promise.resolve([{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }]);
  },
};

export default nextConfig;
