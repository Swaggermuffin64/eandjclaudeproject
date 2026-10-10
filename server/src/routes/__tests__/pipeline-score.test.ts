import { jest } from '@jest/globals';
import type { FastifyInstance } from 'fastify';

// Tests for POST /api/pipeline/score — the score-only endpoint that takes an
// existing dossier text file and runs just the scoring step. runScore is mocked
// so no Claude calls are made; each test controls when scoring finishes.

const runScoreMock = jest.fn<(...args: unknown[]) => Promise<{ score: string }>>();

jest.unstable_mockModule('../../pipeline/steps/score/index.js', () => ({
  runScore: runScoreMock,
}));

const Fastify = (await import('fastify')).default;
const { registerMultipart } = await import('../../plugins/multipart.js');
const { pipelineRoutes } = await import('../pipeline.js');
const { acquirePipelineLock, releasePipelineLock, isPipelineLocked } = await import(
  '../../pipeline/orchestrator.js'
);

const BOUNDARY = 'test-boundary';

/** Builds a multipart/form-data body with an optional dossier file and rubric field. */
function buildMultipartBody(fields: { dossier?: string; rubric?: string }): Buffer {
  const parts: string[] = [];
  if (fields.dossier !== undefined) {
    parts.push(
      `--${BOUNDARY}\r\n` +
        'Content-Disposition: form-data; name="dossier"; filename="dossier.txt"\r\n' +
        'Content-Type: text/plain\r\n\r\n' +
        `${fields.dossier}\r\n`,
    );
  }
  if (fields.rubric !== undefined) {
    parts.push(
      `--${BOUNDARY}\r\n` +
        'Content-Disposition: form-data; name="rubric"\r\n\r\n' +
        `${fields.rubric}\r\n`,
    );
  }
  parts.push(`--${BOUNDARY}--\r\n`);
  return Buffer.from(parts.join(''));
}

/** Sends a score-only request to the app and returns the injected response. */
function postScore(app: FastifyInstance, fields: { dossier?: string; rubric?: string }) {
  return app.inject({
    method: 'POST',
    url: '/api/pipeline/score',
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    payload: buildMultipartBody(fields),
  });
}

/** Parses the `data: {...}` lines of an SSE response body into event objects. */
function parseSseEvents(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

describe('POST /api/pipeline/score', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    runScoreMock.mockReset();
    releasePipelineLock();
    app = Fastify();
    await registerMultipart(app);
    await app.register(pipelineRoutes);
  });

  afterEach(async () => {
    await app.close();
    releasePipelineLock();
  });

  it('streams the score result and completes', async () => {
    runScoreMock.mockResolvedValue({ score: 'SCORE OUTPUT' });

    const res = await postScore(app, { dossier: 'dossier text', rubric: 'technology' });

    expect(res.statusCode).toBe(200);
    expect(runScoreMock).toHaveBeenCalledWith(
      { dossier: 'dossier text', rubric: 'technology' },
      expect.anything(),
    );
    const types = parseSseEvents(res.body).map((e) => e.type);
    expect(types).toContain('result:score');
    expect(types[types.length - 1]).toBe('pipeline:complete');
    expect(isPipelineLocked()).toBe(false);
  });

  it('streams a pipeline:error event and releases the lock when scoring fails', async () => {
    runScoreMock.mockRejectedValue(new Error('scoring blew up'));

    const res = await postScore(app, { dossier: 'dossier text', rubric: 'technology' });

    const errorEvent = parseSseEvents(res.body).find((e) => e.type === 'pipeline:error');
    expect(errorEvent).toMatchObject({ error: 'scoring blew up', step: 'score' });
    expect(isPipelineLocked()).toBe(false);
  });

  it('rejects a request without a dossier file', async () => {
    const res = await postScore(app, { rubric: 'technology' });

    expect(res.statusCode).toBe(400);
    expect(runScoreMock).not.toHaveBeenCalled();
  });

  it.each(['technology', 'life-sciences', 'defense'])('accepts the %s rubric', async (rubric) => {
    runScoreMock.mockResolvedValue({ score: 'score text' });

    const res = await postScore(app, { dossier: 'dossier text', rubric });

    expect(res.statusCode).toBe(200);
    expect(runScoreMock).toHaveBeenCalledWith({ dossier: 'dossier text', rubric }, expect.anything());
  });

  it('rejects an unknown rubric', async () => {
    const res = await postScore(app, { dossier: 'dossier text', rubric: 'astrology' });

    expect(res.statusCode).toBe(400);
    expect(runScoreMock).not.toHaveBeenCalled();
  });

  it('returns 409 when another pipeline run holds the lock', async () => {
    acquirePipelineLock();

    const res = await postScore(app, { dossier: 'dossier text', rubric: 'technology' });

    expect(res.statusCode).toBe(409);
    expect(runScoreMock).not.toHaveBeenCalled();
  });

  // Regression: the lock used to be taken only after the 200 response had started,
  // so a second request that slipped in during upload parsing threw an unhandled
  // rejection (which crashes Node) instead of getting a clean 409.
  it('lets exactly one of two concurrent requests run', async () => {
    runScoreMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ score: 'SCORE' }), 50)),
    );

    const responses = await Promise.all([
      postScore(app, { dossier: 'first', rubric: 'technology' }),
      postScore(app, { dossier: 'second', rubric: 'technology' }),
    ]);

    const statusCodes = responses.map((r) => r.statusCode).sort();
    expect(statusCodes).toEqual([200, 409]);
    expect(runScoreMock).toHaveBeenCalledTimes(1);
    expect(isPipelineLocked()).toBe(false);
  });
});

describe('pipeline lock helpers', () => {
  afterEach(() => releasePipelineLock());

  it('acquires a free lock and refuses a held one', () => {
    expect(acquirePipelineLock()).toBe(true);
    expect(isPipelineLocked()).toBe(true);
    expect(acquirePipelineLock()).toBe(false);
  });

  it('can be acquired again after release', () => {
    acquirePipelineLock();
    releasePipelineLock();
    expect(isPipelineLocked()).toBe(false);
    expect(acquirePipelineLock()).toBe(true);
  });
});
