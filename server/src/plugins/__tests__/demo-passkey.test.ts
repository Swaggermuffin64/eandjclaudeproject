import Fastify, { type FastifyInstance } from 'fastify';
import { registerCors } from '../cors.js';
import { registerDemoPasskey } from '../demo-passkey.js';

// Tests for the demo passkey gate: pipeline routes need the passkey header when
// one is configured, while health checks and CORS preflights stay open.

const ORIGIN = 'https://frontend.example.com';

async function buildApp(passkey: string | undefined): Promise<FastifyInstance> {
  const app = Fastify();
  await registerCors(app, [ORIGIN]);
  await registerDemoPasskey(app, passkey);
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.post('/api/pipeline/run', async () => ({ ran: true }));
  return app;
}

describe('registerDemoPasskey', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('rejects a pipeline request with no passkey', async () => {
    app = await buildApp('secret');
    const response = await app.inject({ method: 'POST', url: '/api/pipeline/run' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Wrong or missing demo passkey' });
  });

  it('rejects a pipeline request with the wrong passkey', async () => {
    app = await buildApp('secret');
    const response = await app.inject({
      method: 'POST',
      url: '/api/pipeline/run',
      headers: { 'x-demo-passkey': 'guess' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('allows a pipeline request with the right passkey', async () => {
    app = await buildApp('secret');
    const response = await app.inject({
      method: 'POST',
      url: '/api/pipeline/run',
      headers: { 'x-demo-passkey': 'secret' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ran: true });
  });

  it('keeps the health check open for Fly.io', async () => {
    app = await buildApp('secret');
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
  });

  it('lets the CORS preflight through so the browser can send the header', async () => {
    app = await buildApp('secret');
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/pipeline/run',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-demo-passkey',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-headers']).toContain('x-demo-passkey');
  });

  it('checks nothing when no passkey is configured (local development)', async () => {
    app = await buildApp(undefined);
    const response = await app.inject({ method: 'POST', url: '/api/pipeline/run' });
    expect(response.statusCode).toBe(200);
  });
});
