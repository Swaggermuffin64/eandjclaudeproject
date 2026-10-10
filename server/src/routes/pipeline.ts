import { EventEmitter } from 'node:events';
import { FastifyInstance } from 'fastify';
import type { RubricType } from '@shared/types/pipeline.js';
import {
  findSourceDocumentFormat,
  ACCEPTED_SOURCE_DOCUMENT_EXTENSIONS,
} from '@shared/types/source-document-formats.js';
import { runPipeline, isPipelineLocked, acquirePipelineLock, releasePipelineLock } from '../pipeline/orchestrator.js';
import { runScore } from '../pipeline/steps/score/index.js';
import { emitStepStart, emitStepComplete, emitEvent } from '../pipeline/types.js';
import type { SourceDocument } from '../pipeline/types.js';
import { openSseStream } from './sse-stream.js';

const VALID_RUBRICS: RubricType[] = ['life-sciences', 'technology', 'defense'];
const INVALID_RUBRIC_ERROR = `rubric must be one of: ${VALID_RUBRICS.map((r) => `"${r}"`).join(', ')}`;

/** The 400 message for an uploaded file whose format the pipeline cannot read. */
function unsupportedFormatError(filename: string): string {
  return `"${filename}" is not a supported file format. Accepted formats: ${ACCEPTED_SOURCE_DOCUMENT_EXTENSIONS.join(', ')}`;
}

export async function pipelineRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/run', async (request, reply) => {
    // Check pipeline lock
    if (isPipelineLocked()) {
      return reply.code(409).send({ error: 'Pipeline is already running' });
    }

    // Parse multipart data
    const parts = request.parts();
    let primaryDocument: SourceDocument | null = null;
    const supplementaryDocuments: SourceDocument[] = [];
    const unsupportedFilenames: string[] = [];
    let rubric: RubricType | null = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        const document: SourceDocument = { filename: part.filename, content: await part.toBuffer() };
        if (!findSourceDocumentFormat(document.filename)) {
          unsupportedFilenames.push(document.filename);
        } else if (part.fieldname === 'primaryDocument') {
          primaryDocument = document;
        } else if (part.fieldname === 'supplementaryDocuments') {
          supplementaryDocuments.push(document);
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'rubric' && typeof part.value === 'string') {
          rubric = part.value as RubricType;
        }
      }
    }

    // Validate inputs
    if (unsupportedFilenames.length > 0) {
      return reply.code(400).send({ error: unsupportedFormatError(unsupportedFilenames[0]) });
    }
    if (!primaryDocument) {
      return reply.code(400).send({ error: 'primaryDocument is required' });
    }
    if (!rubric || !VALID_RUBRICS.includes(rubric)) {
      return reply.code(400).send({ error: INVALID_RUBRIC_ERROR });
    }

    // Re-check after parsing: another run may have started while we awaited the
    // upload. Nothing awaits between here and runPipeline() taking the lock.
    if (isPipelineLocked()) {
      return reply.code(409).send({ error: 'Pipeline is already running' });
    }

    // Set up SSE
    const stream = openSseStream(reply);
    const emitter = new EventEmitter();

    emitter.on('pipeline-event', (event: Record<string, unknown>) => {
      stream.send(event);
    });

    // Run pipeline (don't await — let it stream)
    runPipeline(
      { primaryDocument, supplementaryDocuments, rubric },
      emitter,
    ).finally(() => {
      stream.close();
    });

    // Prevent Fastify from sending its own response
    return reply;
  });

  // ------------------------------------------------------------------
  // Score-only endpoint: accepts a dossier text file + rubric
  // ------------------------------------------------------------------
  app.post('/api/pipeline/score', async (request, reply) => {
    if (isPipelineLocked()) {
      return reply.code(409).send({ error: 'Pipeline is already running' });
    }

    const parts = request.parts();
    let dossierText: string | null = null;
    let rubric: RubricType | null = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        if (part.fieldname === 'dossier') {
          const buffer = await part.toBuffer();
          dossierText = buffer.toString('utf-8');
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'rubric' && typeof part.value === 'string') {
          rubric = part.value as RubricType;
        }
      }
    }

    if (!dossierText) {
      return reply.code(400).send({ error: 'dossier file is required' });
    }
    if (!rubric || !VALID_RUBRICS.includes(rubric)) {
      return reply.code(400).send({ error: INVALID_RUBRIC_ERROR });
    }

    // Take the lock now, after the upload is parsed. The isPipelineLocked() check
    // above is only a fast rejection: another run can start while we await the
    // multipart parts, so this is the check that actually guards the run.
    if (!acquirePipelineLock()) {
      return reply.code(409).send({ error: 'Pipeline is already running' });
    }

    const stream = openSseStream(reply);
    const emitter = new EventEmitter();

    emitter.on('pipeline-event', (event: Record<string, unknown>) => {
      stream.send(event);
    });

    const scoreRun = async () => {
      try {
        emitStepStart(emitter, 'score');
        const scoreResult = await runScore(
          { dossier: dossierText!, rubric: rubric! },
          emitter,
        );
        emitStepComplete(emitter, 'score');

        emitEvent(emitter, {
          type: 'result:score',
          content: scoreResult.score,
          timestamp: new Date().toISOString(),
        });

        emitEvent(emitter, {
          type: 'pipeline:complete',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        emitEvent(emitter, {
          type: 'pipeline:error',
          error: message,
          step: 'score',
          timestamp: new Date().toISOString(),
        });
      } finally {
        releasePipelineLock();
      }
    };

    scoreRun().finally(() => {
      stream.close();
    });

    return reply;
  });
}
