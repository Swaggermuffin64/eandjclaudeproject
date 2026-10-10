import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { PipelineRunInput, SourceDocument, TemplateInput, UploadedSourceDocument } from '../types.js';

// Tests for the pipeline orchestrator's handling of source documents: they are
// uploaded once, handed to the template step, and deleted as soon as that step is
// over. The steps and the Files API module are mocked so no Claude calls are made.

const uploadSourceDocumentMock = jest.fn<(document: SourceDocument) => Promise<UploadedSourceDocument>>();
const deleteSourceDocumentsMock = jest.fn<(fileIds: string[]) => Promise<void>>();
const runTemplateMock = jest.fn<(input: TemplateInput) => Promise<{ filledTemplate: string }>>();
const runDossierMock = jest.fn<(input: { filledTemplate: string }) => Promise<{ dossier: string }>>();
const runScoreMock = jest.fn<() => Promise<{ score: string }>>();

jest.unstable_mockModule('../claude/source-document-files.js', () => ({
  uploadSourceDocument: uploadSourceDocumentMock,
  deleteSourceDocuments: deleteSourceDocumentsMock,
}));
jest.unstable_mockModule('../steps/template.js', () => ({ runTemplate: runTemplateMock }));
jest.unstable_mockModule('../steps/dossier/index.js', () => ({ runDossier: runDossierMock }));
jest.unstable_mockModule('../steps/score/index.js', () => ({ runScore: runScoreMock }));

const { runPipeline, isPipelineLocked } = await import('../orchestrator.js');

const RUN_INPUT: PipelineRunInput = {
  primaryDocument: { filename: 'deck.pdf', content: Buffer.from('deck') },
  supplementaryDocuments: [
    { filename: 'memo.docx', content: Buffer.from('memo') },
    { filename: 'traction.png', content: Buffer.from('png') },
  ],
  rubric: 'technology',
};

/** Runs the pipeline and returns every event it emitted, in order. */
async function runAndCollectEvents(input: PipelineRunInput = RUN_INPUT): Promise<Array<Record<string, unknown>>> {
  const emitter = new EventEmitter();
  const events: Array<Record<string, unknown>> = [];
  emitter.on('pipeline-event', (event: Record<string, unknown>) => events.push(event));
  await runPipeline(input, emitter);
  return events;
}

beforeEach(() => {
  uploadSourceDocumentMock.mockReset();
  deleteSourceDocumentsMock.mockReset();
  runTemplateMock.mockReset();
  runDossierMock.mockReset();
  runScoreMock.mockReset();

  // Each upload gets a file id derived from its filename: deck.pdf -> file_deck.pdf.
  uploadSourceDocumentMock.mockImplementation(async (document) => ({
    fileId: `file_${document.filename}`,
    filename: document.filename,
    kind: 'pdf',
  }));
  deleteSourceDocumentsMock.mockResolvedValue(undefined);
  runTemplateMock.mockResolvedValue({ filledTemplate: 'filled template' });
  runDossierMock.mockResolvedValue({ dossier: 'dossier text' });
  runScoreMock.mockResolvedValue({ score: 'score text' });
});

describe('runPipeline source documents', () => {
  it('gives the template step the uploaded primary and supplementary documents', async () => {
    await runAndCollectEvents();

    const templateInput = runTemplateMock.mock.calls[0][0];
    expect(templateInput.primaryDocument.fileId).toBe('file_deck.pdf');
    expect(templateInput.supplementaryDocuments.map((document) => document.fileId)).toEqual([
      'file_memo.docx',
      'file_traction.png',
    ]);
  });

  it('deletes every uploaded file once the template step has finished', async () => {
    await runAndCollectEvents();

    expect(deleteSourceDocumentsMock).toHaveBeenCalledTimes(1);
    expect([...deleteSourceDocumentsMock.mock.calls[0][0]].sort()).toEqual([
      'file_deck.pdf',
      'file_memo.docx',
      'file_traction.png',
    ]);
  });

  it('deletes the uploaded files before the dossier step starts', async () => {
    let deletedWhenDossierStarted = false;
    runDossierMock.mockImplementation(async () => {
      deletedWhenDossierStarted = deleteSourceDocumentsMock.mock.calls.length === 1;
      return { dossier: 'dossier text' };
    });

    await runAndCollectEvents();

    expect(deletedWhenDossierStarted).toBe(true);
  });

  it('deletes the uploaded files when the template step fails', async () => {
    runTemplateMock.mockRejectedValue(new Error('template exploded'));

    const events = await runAndCollectEvents();

    expect(deleteSourceDocumentsMock).toHaveBeenCalledTimes(1);
    expect(deleteSourceDocumentsMock.mock.calls[0][0]).toHaveLength(3);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'pipeline:error', error: 'template exploded' }),
    );
  });

  it('deletes the files that did upload when another upload fails, and skips the template step', async () => {
    uploadSourceDocumentMock.mockImplementation(async (document) => {
      if (document.filename === 'memo.docx') throw new Error('Could not read text from "memo.docx"');
      return { fileId: `file_${document.filename}`, filename: document.filename, kind: 'pdf' };
    });

    const events = await runAndCollectEvents();

    expect([...deleteSourceDocumentsMock.mock.calls[0][0]].sort()).toEqual([
      'file_deck.pdf',
      'file_traction.png',
    ]);
    expect(runTemplateMock).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'pipeline:error', error: 'Could not read text from "memo.docx"' }),
    );
  });

  it('reports the upload as part of the template step', async () => {
    let templateStartedWhenUploadBegan = false;
    const emitter = new EventEmitter();
    const events: Array<Record<string, unknown>> = [];
    emitter.on('pipeline-event', (event: Record<string, unknown>) => events.push(event));
    uploadSourceDocumentMock.mockImplementation(async (document) => {
      templateStartedWhenUploadBegan = events.some(
        (event) => event.type === 'step:start' && event.step === 'template',
      );
      return { fileId: `file_${document.filename}`, filename: document.filename, kind: 'pdf' };
    });

    await runPipeline(RUN_INPUT, emitter);

    expect(templateStartedWhenUploadBegan).toBe(true);
  });

  it('runs template, dossier and score in order and completes', async () => {
    const events = await runAndCollectEvents();

    const stepEvents = events
      .filter((event) => event.type === 'step:start' || event.type === 'step:complete')
      .map((event) => `${event.type} ${event.step}`);
    expect(stepEvents).toEqual([
      'step:start template',
      'step:complete template',
      'step:start dossier',
      'step:complete dossier',
      'step:start score',
      'step:complete score',
    ]);
    expect(events[events.length - 1].type).toBe('pipeline:complete');
  });

  it('passes the filled template on to the dossier step', async () => {
    await runAndCollectEvents();

    expect(runDossierMock.mock.calls[0][0]).toEqual({ filledTemplate: 'filled template' });
  });

  it('releases the pipeline lock after a failed run', async () => {
    runTemplateMock.mockRejectedValue(new Error('template exploded'));

    await runAndCollectEvents();

    expect(isPipelineLocked()).toBe(false);
  });
});
