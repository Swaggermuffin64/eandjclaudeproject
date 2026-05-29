import multipart from '@fastify/multipart';
import { FastifyInstance } from 'fastify';

const MAX_FILE_SIZE = 32 * 1024 * 1024; // 32MB

export async function registerMultipart(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
  });
}
