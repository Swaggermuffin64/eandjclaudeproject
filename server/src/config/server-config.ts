/**
 * Deploy-time settings for the API server, read from environment variables.
 *
 * Locally nothing needs to be set: the defaults match the Vite dev server
 * (http://localhost:3000) talking to this server on port 3001. In production
 * (Fly.io) PORT is set by fly.toml and CORS_ORIGINS lists the Vercel frontend URL(s).
 * DEMO_PASSKEY, when set, locks the pipeline routes behind a shared password.
 */

const DEFAULT_PORT = 3001;
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000'];

export interface ServerConfig {
  /** TCP port the HTTP server listens on. */
  port: number;
  /** Browser origins allowed to call the API (exact match, no trailing slash). */
  allowedOrigins: string[];
  /** Shared password required by the pipeline routes; undefined means no check. */
  demoPasskey: string | undefined;
}

/**
 * Builds the server config from environment variables.
 *
 * - PORT: integer 1-65535, defaults to 3001.
 * - CORS_ORIGINS: comma-separated origins, e.g. "https://app.vercel.app,https://example.com".
 *   Trailing slashes are removed because browsers send origins without them.
 * - DEMO_PASSKEY: optional shared password for the demo (blank counts as unset).
 *
 * Throws on an invalid PORT so a misconfigured deploy fails at startup instead of later.
 */
export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: parsePort(env.PORT),
    allowedOrigins: parseAllowedOrigins(env.CORS_ORIGINS),
    demoPasskey: env.DEMO_PASSKEY?.trim() || undefined,
  };
}

function parsePort(rawPort: string | undefined): number {
  if (rawPort === undefined || rawPort.trim() === '') {
    return DEFAULT_PORT;
  }
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${rawPort}"`);
  }
  return port;
}

function parseAllowedOrigins(rawOrigins: string | undefined): string[] {
  const origins = (rawOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS;
}
