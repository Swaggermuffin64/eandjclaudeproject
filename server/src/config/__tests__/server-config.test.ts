import { readServerConfig } from '../server-config.js';

// Tests for readServerConfig — the env-var parsing that lets the same server
// build run locally (defaults) and on Fly.io (PORT + CORS_ORIGINS set).

describe('readServerConfig', () => {
  it('uses local-development defaults when nothing is set', () => {
    expect(readServerConfig({})).toEqual({
      port: 3001,
      allowedOrigins: ['http://localhost:3000'],
      demoPasskey: undefined,
    });
  });

  it('reads PORT as a number', () => {
    expect(readServerConfig({ PORT: '8080' }).port).toBe(8080);
  });

  it('treats a blank PORT as unset', () => {
    expect(readServerConfig({ PORT: '  ' }).port).toBe(3001);
  });

  it.each(['abc', '0', '70000', '80.5'])('rejects invalid PORT "%s"', (port) => {
    expect(() => readServerConfig({ PORT: port })).toThrow(/PORT must be an integer/);
  });

  it('splits CORS_ORIGINS on commas and trims whitespace', () => {
    const config = readServerConfig({
      CORS_ORIGINS: ' https://app.vercel.app , https://example.com ',
    });
    expect(config.allowedOrigins).toEqual(['https://app.vercel.app', 'https://example.com']);
  });

  it('strips trailing slashes so origins match what browsers send', () => {
    const config = readServerConfig({ CORS_ORIGINS: 'https://app.vercel.app/' });
    expect(config.allowedOrigins).toEqual(['https://app.vercel.app']);
  });

  it('falls back to the default origin when CORS_ORIGINS has no entries', () => {
    expect(readServerConfig({ CORS_ORIGINS: ' , ' }).allowedOrigins).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('reads DEMO_PASSKEY and treats a blank one as unset', () => {
    expect(readServerConfig({ DEMO_PASSKEY: 'secret' }).demoPasskey).toBe('secret');
    expect(readServerConfig({ DEMO_PASSKEY: '  ' }).demoPasskey).toBeUndefined();
  });
});
