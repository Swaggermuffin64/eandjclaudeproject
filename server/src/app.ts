import Fastify from 'fastify';
import { readServerConfig, type ServerConfig } from './config/server-config.js';
import { registerCors } from './plugins/cors.js';
import { registerDemoPasskey } from './plugins/demo-passkey.js';
import { registerMultipart } from './plugins/multipart.js';
import { healthRoutes } from './routes/health.js';
import { pipelineRoutes } from './routes/pipeline.js';

/** Builds the Fastify app with all plugins and routes. Config defaults to environment variables. */
export async function buildApp(config: ServerConfig = readServerConfig()) {
  const app = Fastify({ logger: true });

  await registerCors(app, config.allowedOrigins);
  await registerDemoPasskey(app, config.demoPasskey);
  await registerMultipart(app);
  await app.register(healthRoutes);
  await app.register(pipelineRoutes);

  return app;
}
