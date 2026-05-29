import Fastify from 'fastify';
import { registerCors } from './plugins/cors.js';
import { healthRoutes } from './routes/health.js';
import { ingestRoutes } from './routes/ingest.js';
import { templateRoutes } from './routes/template.js';
import { dossierRoutes } from './routes/dossier.js';
import { scoreRoutes } from './routes/score.js';
import { auditRoutes } from './routes/audit.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerCors(app);
  await app.register(healthRoutes);
  await app.register(ingestRoutes);
  await app.register(templateRoutes);
  await app.register(dossierRoutes);
  await app.register(scoreRoutes);
  await app.register(auditRoutes);

  return app;
}
