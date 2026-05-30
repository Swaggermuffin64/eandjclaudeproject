import { EventEmitter } from 'node:events';
import type { PipelineRunInput, PipelineEmitter } from './types.js';
import { emitStepStart, emitStepComplete, emitEvent } from './types.js';
import { runIngest } from './steps/ingest.js';
import { runTemplate } from './steps/template.js';
import { runDossier } from './steps/dossier/index.js';
import { runScore } from './steps/score/index.js';

let pipelineLocked = false;

export function isPipelineLocked(): boolean {
  return pipelineLocked;
}

export async function runPipeline(input: PipelineRunInput, emitter: PipelineEmitter): Promise<void> {
  if (pipelineLocked) {
    throw new Error('Pipeline is already running');
  }

  pipelineLocked = true;

  try {
    // Step 1: Ingest
    emitStepStart(emitter, 'ingest');
    const ingestResult = await runIngest(
      { primaryPdf: input.primaryPdf, supplementaryPdfs: input.supplementaryPdfs },
      emitter,
    );
    emitStepComplete(emitter, 'ingest');

    // Step 2: Template
    emitStepStart(emitter, 'template');
    const templateResult = await runTemplate(
      { extractedText: ingestResult.extractedText, entityManifest: ingestResult.entityManifest },
      emitter,
    );
    emitStepComplete(emitter, 'template');

    // Step 3: Dossier
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

    // Step 4: Score
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
    pipelineLocked = false;
  }
}
