import { FastifyInstance } from 'fastify';
import { PipelineStepResponse } from '@shared/types/pipeline.js';

export async function auditRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/audit', async (): Promise<PipelineStepResponse> => {
    return {
      step: 'audit',
      status: 'pending',
      data: null,
      timestamp: new Date().toISOString(),
    };
  });
}
