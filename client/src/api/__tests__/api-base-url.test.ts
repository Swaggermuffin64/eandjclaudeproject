import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from '../api-base-url';

// Tests for resolveApiBaseUrl — how the frontend finds the API server locally
// (no env var) and in production (VITE_API_ORIGIN set in Vercel).

describe('resolveApiBaseUrl', () => {
  it('defaults to the local server when no origin is configured', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('http://localhost:3001/api');
  });

  it('treats a blank origin as unset', () => {
    expect(resolveApiBaseUrl('   ')).toBe('http://localhost:3001/api');
  });

  it('appends /api to the configured origin', () => {
    expect(resolveApiBaseUrl('https://my-app.fly.dev')).toBe('https://my-app.fly.dev/api');
  });

  it('removes trailing slashes so paths never contain "//"', () => {
    expect(resolveApiBaseUrl('https://my-app.fly.dev/')).toBe('https://my-app.fly.dev/api');
  });
});
