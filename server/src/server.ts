import 'dotenv/config';
import { buildApp } from './app.js';
import { readServerConfig } from './config/server-config.js';

async function start() {
  const config = readServerConfig();
  const app = await buildApp(config);

  // 0.0.0.0 so the server is reachable from outside its container (required on Fly.io).
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`Server running on port ${config.port}, allowing origins: ${config.allowedOrigins.join(', ')}`);
}

start();
