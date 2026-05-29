import { FastifyInstance } from 'fastify';
import { PipelineStepResponse } from '@shared/types/pipeline.js';

export async function templateRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/template', async (): Promise<PipelineStepResponse> => {
    return {
      step: 'template',
      status: 'pending',
      data: null,
      timestamp: new Date().toISOString(),
    };
  });
}
