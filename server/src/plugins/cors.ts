import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';

/**
 * Lets the frontend call the API from another origin (Vite dev server locally,
 * Vercel in production). The CORS headers this sets are also copied onto the
 * streaming responses by openSseStream, so this is the single source of truth.
 */
export async function registerCors(app: FastifyInstance, allowedOrigins: string[]) {
  await app.register(cors, {
    origin: allowedOrigins,
  });
}
