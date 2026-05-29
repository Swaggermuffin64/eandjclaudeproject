import Fastify from 'fastify';
import { registerCors } from './plugins/cors.js';
import { registerMultipart } from './plugins/multipart.js';
import { healthRoutes } from './routes/health.js';
import { pipelineRoutes } from './routes/pipeline.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerCors(app);
  await registerMultipart(app);
  await app.register(healthRoutes);
  await app.register(pipelineRoutes);

  return app;
}
