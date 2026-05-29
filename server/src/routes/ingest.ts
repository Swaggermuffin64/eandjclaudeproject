import { FastifyInstance } from 'fastify';
import { PipelineStepResponse } from '@shared/types/pipeline.js';

export async function ingestRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/ingest', async (): Promise<PipelineStepResponse> => {
    return {
      step: 'ingest',
      status: 'pending',
      data: null,
      timestamp: new Date().toISOString(),
    };
  });
}
