import { FastifyInstance } from 'fastify';
import { PipelineStepResponse } from '@shared/types/pipeline.js';

export async function dossierRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/dossier', async (): Promise<PipelineStepResponse> => {
    return {
      step: 'dossier',
      status: 'pending',
      data: null,
      timestamp: new Date().toISOString(),
    };
  });
}
