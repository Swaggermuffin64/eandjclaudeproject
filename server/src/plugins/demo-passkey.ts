import { FastifyInstance } from 'fastify';

/**
 * Minimal shared-password gate for demos, so a public deploy can't be used to
 * spend the Anthropic API key. Not real authentication.
 *
 * When a passkey is configured (DEMO_PASSKEY), every /api/pipeline/* request must
 * send it in the X-Demo-Passkey header or gets a 401. The health check stays open
 * so Fly.io can still probe it, and CORS preflight (OPTIONS) is let through so
 * the browser is allowed to send the header in the first place.
 * When no passkey is configured (local development), nothing is checked.
 */

export const PASSKEY_HEADER = 'x-demo-passkey';

export async function registerDemoPasskey(app: FastifyInstance, passkey: string | undefined) {
  if (!passkey) {
    return;
  }

  app.addHook('onRequest', async (request, reply) => {
    const isPipelineRoute = request.url.startsWith('/api/pipeline');
    if (!isPipelineRoute || request.method === 'OPTIONS') {
      return;
    }
    if (request.headers[PASSKEY_HEADER] !== passkey) {
      return reply.code(401).send({ error: 'Wrong or missing demo passkey' });
    }
  });
}
