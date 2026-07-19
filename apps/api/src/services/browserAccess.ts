import crypto from 'node:crypto';

export const BROWSER_INVITE_TTL_MS = 30 * 60 * 1000;
export const BROWSER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createBrowserInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashBrowserInviteToken(token: string) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function browserInviteExpiresAt(now = new Date()) {
  return new Date(now.getTime() + BROWSER_INVITE_TTL_MS);
}

export function browserSessionExpiresAt(now = new Date()) {
  return new Date(now.getTime() + BROWSER_SESSION_TTL_MS);
}
