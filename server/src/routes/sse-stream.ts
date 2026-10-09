import type { OutgoingHttpHeaders } from 'node:http';
import type { FastifyReply } from 'fastify';

/**
 * Server-Sent Events helper shared by the pipeline routes.
 *
 * The pipeline routes stream progress events to the browser over one long HTTP
 * response. Writing to reply.raw bypasses Fastify's normal response handling, so
 * this helper:
 *   - copies headers already set on the reply (notably CORS headers from the
 *     cors plugin) into the raw response,
 *   - sends a comment line every few seconds so proxies (Fly.io, browsers) don't
 *     close the connection during long Claude calls that emit no events.
 *     Comment lines start with ":" and are ignored by the client's parser.
 */

/** Fly.io's proxy drops idle connections after about 60s; stay well under that. */
export const SSE_HEARTBEAT_INTERVAL_MS = 20_000;

export interface SseStream {
  /** Sends one event as a `data: <json>` line. Ignored once the stream is closed. */
  send(event: object): void;
  /** Stops the heartbeat and ends the response. Safe to call more than once. */
  close(): void;
}

export function openSseStream(
  reply: FastifyReply,
  heartbeatIntervalMs: number = SSE_HEARTBEAT_INTERVAL_MS,
): SseStream {
  const response = reply.raw;

  response.writeHead(200, {
    // Fastify's header type is wider than Node's; the values are plain header strings.
    ...(reply.getHeaders() as OutgoingHttpHeaders),
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const writeIfOpen = (chunk: string) => {
    if (!response.writableEnded && !response.destroyed) {
      response.write(chunk);
    }
  };

  const heartbeat = setInterval(() => writeIfOpen(': heartbeat\n\n'), heartbeatIntervalMs);
  // If the browser disconnects early, stop the timer instead of writing to a dead socket.
  response.on('close', () => clearInterval(heartbeat));

  return {
    send(event) {
      writeIfOpen(`data: ${JSON.stringify(event)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      if (!response.writableEnded) {
        response.end();
      }
    },
  };
}
