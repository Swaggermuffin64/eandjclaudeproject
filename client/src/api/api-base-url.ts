/**
 * Works out where the frontend sends API requests.
 *
 * Locally the API runs on http://localhost:3001. In production (Vercel) set
 * VITE_API_ORIGIN to the Fly.io server's origin, e.g. https://my-app.fly.dev.
 * Vite bakes the value into the bundle at build time, so changing it in Vercel
 * requires a redeploy.
 */

export const LOCAL_API_ORIGIN = 'http://localhost:3001';

/** Returns the API base URL (origin + "/api"), falling back to the local server when unset. */
export function resolveApiBaseUrl(configuredOrigin: string | undefined): string {
  const origin = configuredOrigin?.trim().replace(/\/+$/, '') || LOCAL_API_ORIGIN;
  return `${origin}/api`;
}
