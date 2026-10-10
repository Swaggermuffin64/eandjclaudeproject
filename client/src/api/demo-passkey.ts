/**
 * Remembers the demo passkey the user typed and turns it into the request header
 * the server checks (see server/src/plugins/demo-passkey.ts).
 *
 * Stored in localStorage so it survives page reloads. Storage can be unavailable
 * (private browsing, blocked site data), so failures are ignored and the passkey
 * simply isn't remembered.
 */

const STORAGE_KEY = 'demoPasskey';

export function loadDemoPasskey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveDemoPasskey(passkey: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, passkey);
  } catch {
    // Not remembered; the user will need to re-enter it after a reload.
  }
}

/** Headers to attach to pipeline requests; empty when no passkey has been entered. */
export function demoPasskeyHeaders(passkey: string): Record<string, string> {
  return passkey ? { 'X-Demo-Passkey': passkey } : {};
}
