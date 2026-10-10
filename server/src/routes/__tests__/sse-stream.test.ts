import Fastify, { type FastifyInstance } from 'fastify';
import { registerCors } from '../../plugins/cors.js';
import { openSseStream } from '../sse-stream.js';

// Tests for openSseStream and the CORS setup it depends on. A tiny test route
// opens a stream, sends events, and closes it, so we can check exactly what the
// browser would receive — including the CORS header that a cross-origin
// frontend (Vercel -> Fly.io) needs to read the stream at all.

const ALLOWED_ORIGIN = 'https://frontend.example.com';

/** Builds an app with CORS plus one streaming route driven by `streamBody`. */
async function buildStreamingApp(
  streamBody: (stream: ReturnType<typeof openSseStream>) => Promise<void> | void,
  heartbeatIntervalMs?: number,
): Promise<FastifyInstance> {
  const app = Fastify();
  await registerCors(app, [ALLOWED_ORIGIN]);
  app.post('/stream', async (_request, reply) => {
    const stream = openSseStream(reply, heartbeatIntervalMs);
    Promise.resolve(streamBody(stream)).finally(() => stream.close());
    return reply;
  });
  return app;
}

describe('openSseStream', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('streams events as data lines with SSE headers', async () => {
    app = await buildStreamingApp((stream) => {
      stream.send({ type: 'step:start', step: 'template' });
      stream.send({ type: 'pipeline:complete' });
    });

    const response = await app.inject({ method: 'POST', url: '/stream' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toBe(
      'data: {"type":"step:start","step":"template"}\n\n' +
        'data: {"type":"pipeline:complete"}\n\n',
    );
  });

  it('includes the CORS header for an allowed origin', async () => {
    app = await buildStreamingApp(() => {});

    const response = await app.inject({
      method: 'POST',
      url: '/stream',
      headers: { origin: ALLOWED_ORIGIN },
    });

    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('omits the CORS header for an origin that is not allowed', async () => {
    app = await buildStreamingApp(() => {});

    const response = await app.inject({
      method: 'POST',
      url: '/stream',
      headers: { origin: 'https://evil.example.com' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends heartbeat comments while waiting for slow events', async () => {
    app = await buildStreamingApp(async (stream) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      stream.send({ type: 'pipeline:complete' });
    }, 10);

    const response = await app.inject({ method: 'POST', url: '/stream' });

    expect(response.body).toContain(': heartbeat\n\n');
    expect(response.body.endsWith('data: {"type":"pipeline:complete"}\n\n')).toBe(true);
  });

  it('ignores events sent after the stream is closed', async () => {
    app = await buildStreamingApp((stream) => {
      stream.send({ n: 1 });
      stream.close();
      stream.send({ n: 2 });
    });

    const response = await app.inject({ method: 'POST', url: '/stream' });

    expect(response.body).toBe('data: {"n":1}\n\n');
  });
});

describe('registerCors preflight', () => {
  it('answers a browser preflight from the allowed origin', async () => {
    const app = Fastify();
    await registerCors(app, [ALLOWED_ORIGIN]);
    app.post('/api/pipeline/run', async () => ({}));

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/pipeline/run',
      headers: { origin: ALLOWED_ORIGIN, 'access-control-request-method': 'POST' },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    await app.close();
  });
});
