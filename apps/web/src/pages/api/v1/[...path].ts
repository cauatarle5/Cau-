import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * API embutida (ADR-064): com `EMBEDDED_API=true` (Vercel), `/api/v1/*` é atendido pela mesma API
 * Fastify, no mesmo processo do Next. Sem a flag, o `next.config` reescreve para `API_URL` antes de
 * chegar aqui (dev, testes, Docker) e esta rota só responde 404.
 */
export const config = {
  // O Fastify lê o corpo cru e controla a resposta (inclusive o SSE do Coach).
  api: { bodyParser: false, responseLimit: false, externalResolver: true },
  maxDuration: 300,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.EMBEDDED_API !== 'true') {
    res.status(404).end();
    return;
  }
  const { handleApiRequest } = await import('@atlas/api/embedded');
  const done = new Promise<void>((resolve) => {
    res.once('close', resolve);
  });
  await handleApiRequest(req, res);
  // A função só termina quando a resposta (ou o stream) termina.
  await done;
}
