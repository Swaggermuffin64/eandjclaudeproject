import { FastifyInstance } from 'fastify';
import { PipelineStepResponse } from '@shared/types/pipeline.js';

export async function scoreRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/score', async (): Promise<PipelineStepResponse> => {
    return {
      step: 'score',
      status: 'pending',
      data: null,
      timestamp: new Date().toISOString(),
    };
  });
}
