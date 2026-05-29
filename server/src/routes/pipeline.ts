import { EventEmitter } from 'node:events';
import { FastifyInstance } from 'fastify';
import type { RubricType } from '@shared/types/pipeline.js';
import { runPipeline, isPipelineLocked } from '../pipeline/orchestrator.js';

const VALID_RUBRICS: RubricType[] = ['life-sciences', 'technology'];

export async function pipelineRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/run', async (request, reply) => {
    // Check pipeline lock
    if (isPipelineLocked()) {
      return reply.code(409).send({ error: 'Pipeline is already running' });
    }

    // Parse multipart data
    const parts = request.parts();
    let primaryPdf: Buffer | null = null;
    const supplementaryPdfs: Buffer[] = [];
    let rubric: RubricType | null = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.fieldname === 'primaryPdf') {
          primaryPdf = buffer;
        } else if (part.fieldname === 'supplementaryPdfs') {
          supplementaryPdfs.push(buffer);
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'rubric' && typeof part.value === 'string') {
          rubric = part.value as RubricType;
        }
      }
    }

    // Validate inputs
    if (!primaryPdf) {
      return reply.code(400).send({ error: 'primaryPdf is required' });
    }
    if (!rubric || !VALID_RUBRICS.includes(rubric)) {
      return reply.code(400).send({ error: 'rubric must be "life-sciences" or "technology"' });
    }

    // Set up SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': 'http://localhost:3000',
    });

    const emitter = new EventEmitter();

    emitter.on('pipeline-event', (event: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Run pipeline (don't await — let it stream)
    runPipeline(
      { primaryPdf, supplementaryPdfs, rubric },
      emitter,
    ).finally(() => {
      reply.raw.end();
    });

    // Prevent Fastify from sending its own response
    return reply;
  });
}
