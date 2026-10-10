import { EventEmitter } from 'node:events';
import type {
  PipelineRunInput,
  PipelineEmitter,
  SourceDocument,
  TemplateOutput,
  UploadedSourceDocument,
} from './types.js';
import { emitStepStart, emitStepComplete, emitEvent } from './types.js';
import { uploadSourceDocument, deleteSourceDocuments } from './claude/source-document-files.js';
import { runTemplate } from './steps/template.js';
import { runDossier } from './steps/dossier/index.js';
import { runScore } from './steps/score/index.js';

let pipelineLocked = false;

export function isPipelineLocked(): boolean {
  return pipelineLocked;
}

export function acquirePipelineLock(): boolean {
  if (pipelineLocked) return false;
  pipelineLocked = true;
  return true;
}

export function releasePipelineLock(): void {
  pipelineLocked = false;
}

/**
 * Uploads every source document to the Files API at once.
 *
 * Returns the uploads that succeeded, in the order the documents were given, plus the
 * first failure if any upload failed. Successful uploads are returned even when another
 * upload fails, so the caller can still delete them.
 */
async function uploadSourceDocuments(
  documents: SourceDocument[],
): Promise<{ successfulUploads: UploadedSourceDocument[]; firstError: unknown }> {
  const results = await Promise.allSettled(documents.map((document) => uploadSourceDocument(document)));

  const successfulUploads = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  const firstFailure = results.find((result) => result.status === 'rejected');
  return { successfulUploads, firstError: firstFailure?.reason };
}

/**
 * Runs the template step against the run's source documents.
 *
 * The documents are uploaded to the Files API first so the step can reference them
 * by file id. The template step is the only step that reads them, so the uploads are
 * deleted as soon as it finishes, whether it succeeded or failed.
 */
async function runTemplateOnSourceDocuments(
  input: PipelineRunInput,
  emitter: PipelineEmitter,
): Promise<TemplateOutput> {
  const { successfulUploads, firstError } = await uploadSourceDocuments([
    input.primaryDocument,
    ...input.supplementaryDocuments,
  ]);

  try {
    if (firstError !== undefined) throw firstError;

    const [primaryDocument, ...supplementaryDocuments] = successfulUploads;
    return await runTemplate({ primaryDocument, supplementaryDocuments }, emitter);
  } finally {
    await deleteSourceDocuments(successfulUploads.map((document) => document.fileId));
  }
}

export async function runPipeline(input: PipelineRunInput, emitter: PipelineEmitter): Promise<void> {
  if (!acquirePipelineLock()) {
    throw new Error('Pipeline is already running');
  }

  try {
    // Step 1: Template (uploads the source documents, reads them, then deletes the uploads)
    emitStepStart(emitter, 'template');
    const templateResult = await runTemplateOnSourceDocuments(input, emitter);
    emitStepComplete(emitter, 'template');

    // Step 2: Dossier
    emitStepStart(emitter, 'dossier');
    const dossierResult = await runDossier(
      { filledTemplate: templateResult.filledTemplate },
      emitter,
    );
    emitStepComplete(emitter, 'dossier');

    // Emit dossier result for download
    emitEvent(emitter, {
      type: 'result:dossier',
      content: dossierResult.dossier,
      timestamp: new Date().toISOString(),
    });

    // Step 3: Score
    emitStepStart(emitter, 'score');
    const scoreResult = await runScore(
      { dossier: dossierResult.dossier, rubric: input.rubric },
      emitter,
    );
    emitStepComplete(emitter, 'score');

    // Emit score result for download
    emitEvent(emitter, {
      type: 'result:score',
      content: scoreResult.score,
      timestamp: new Date().toISOString(),
    });

    // Pipeline complete
    emitEvent(emitter, {
      type: 'pipeline:complete',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    emitEvent(emitter, {
      type: 'pipeline:error',
      error: message,
      step: 'unknown',
      timestamp: new Date().toISOString(),
    });
  } finally {
    releasePipelineLock();
  }
}
