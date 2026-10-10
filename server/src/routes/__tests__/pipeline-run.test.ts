import { jest } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { PipelineRunInput } from '../../pipeline/types.js';

// Tests for POST /api/pipeline/run — the upload endpoint that starts a full run.
// They cover how uploaded files are validated and handed to the pipeline.
// runPipeline is mocked so no Claude calls are made.

const runPipelineMock = jest.fn<(input: PipelineRunInput) => Promise<void>>();

jest.unstable_mockModule('../../pipeline/orchestrator.js', () => ({
  runPipeline: runPipelineMock,
  isPipelineLocked: () => false,
  acquirePipelineLock: () => true,
  releasePipelineLock: () => {},
}));
jest.unstable_mockModule('../../pipeline/steps/score/index.js', () => ({
  runScore: jest.fn(),
}));

const Fastify = (await import('fastify')).default;
const { registerMultipart } = await import('../../plugins/multipart.js');
const { pipelineRoutes } = await import('../pipeline.js');

const BOUNDARY = 'test-boundary';

interface UploadedFilePart {
  field: string;
  filename: string;
  content: string;
}

/** Builds a multipart/form-data body from file parts and an optional rubric field. */
function buildMultipartBody(files: UploadedFilePart[], rubric?: string): Buffer {
  const parts = files.map(
    (file) =>
      `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n` +
      'Content-Type: application/octet-stream\r\n\r\n' +
      `${file.content}\r\n`,
  );
  if (rubric !== undefined) {
    parts.push(
      `--${BOUNDARY}\r\n` + 'Content-Disposition: form-data; name="rubric"\r\n\r\n' + `${rubric}\r\n`,
    );
  }
  parts.push(`--${BOUNDARY}--\r\n`);
  return Buffer.from(parts.join(''));
}

/** Sends a run request to the app and returns the injected response. */
function postRun(app: FastifyInstance, files: UploadedFilePart[], rubric: string | undefined = 'technology') {
  return app.inject({
    method: 'POST',
    url: '/api/pipeline/run',
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    payload: buildMultipartBody(files, rubric),
  });
}

let app: FastifyInstance;

beforeEach(async () => {
  runPipelineMock.mockReset();
  runPipelineMock.mockResolvedValue(undefined);
  app = Fastify();
  await registerMultipart(app);
  await app.register(pipelineRoutes);
});

afterEach(async () => {
  await app.close();
});

describe('POST /api/pipeline/run', () => {
  it('hands each uploaded document to the pipeline with its filename and bytes', async () => {
    await postRun(app, [
      { field: 'primaryDocument', filename: 'memo.docx', content: 'docx-bytes' },
      { field: 'supplementaryDocuments', filename: 'traction.png', content: 'png-bytes' },
      { field: 'supplementaryDocuments', filename: 'financials.csv', content: 'a,b' },
    ]);

    expect(runPipelineMock).toHaveBeenCalledTimes(1);
    const input = runPipelineMock.mock.calls[0][0];
    expect(input.primaryDocument.filename).toBe('memo.docx');
    expect(input.primaryDocument.content.toString()).toBe('docx-bytes');
    expect(
      input.supplementaryDocuments.map((document) => [document.filename, document.content.toString()]),
    ).toEqual([
      ['traction.png', 'png-bytes'],
      ['financials.csv', 'a,b'],
    ]);
    expect(input.rubric).toBe('technology');
  });

  it('rejects a primary document in an unsupported format and names the file', async () => {
    const response = await postRun(app, [
      { field: 'primaryDocument', filename: 'old-deck.ppt', content: 'x' },
    ]);

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('"old-deck.ppt"');
    expect(response.json().error).toContain('.pptx');
    expect(runPipelineMock).not.toHaveBeenCalled();
  });

  it('rejects a supplementary document in an unsupported format', async () => {
    const response = await postRun(app, [
      { field: 'primaryDocument', filename: 'deck.pdf', content: 'x' },
      { field: 'supplementaryDocuments', filename: 'archive.zip', content: 'x' },
    ]);

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('"archive.zip"');
    expect(runPipelineMock).not.toHaveBeenCalled();
  });

  it('requires a primary document', async () => {
    const response = await postRun(app, [
      { field: 'supplementaryDocuments', filename: 'memo.docx', content: 'x' },
    ]);

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('primaryDocument is required');
    expect(runPipelineMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown rubric', async () => {
    const response = await postRun(
      app,
      [{ field: 'primaryDocument', filename: 'deck.pdf', content: 'x' }],
      'not-a-rubric',
    );

    expect(response.statusCode).toBe(400);
    expect(runPipelineMock).not.toHaveBeenCalled();
  });
});
