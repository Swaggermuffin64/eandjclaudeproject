import Fastify from 'fastify';
import { registerCors } from './plugins/cors.js';
import { healthRoutes } from './routes/health.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerCors(app);
  await app.register(healthRoutes);

  return app;
}
