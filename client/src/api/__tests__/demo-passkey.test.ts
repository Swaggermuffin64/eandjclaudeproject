import { describe, expect, it } from 'vitest';
import { demoPasskeyHeaders } from '../demo-passkey';

// Tests for demoPasskeyHeaders — the header the server's passkey gate checks.

describe('demoPasskeyHeaders', () => {
  it('sends the passkey in the X-Demo-Passkey header', () => {
    expect(demoPasskeyHeaders('secret')).toEqual({ 'X-Demo-Passkey': 'secret' });
  });

  it('sends no header when no passkey has been entered', () => {
    expect(demoPasskeyHeaders('')).toEqual({});
  });
});
