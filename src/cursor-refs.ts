import crypto from 'crypto';

interface RefEntry {
  buffer: Buffer;
  mimeType: string;
  expiresAt: number;
}

const refs = new Map<string, RefEntry>();
const TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of refs) {
    if (entry.expiresAt <= now) refs.delete(token);
  }
}, 5 * 60 * 1000).unref?.();

/** Stores image bytes for a short-lived public URL Cursor Cloud can fetch. */
export function storeCursorRef(buffer: Buffer, mimeType: string): string {
  const token = crypto.randomBytes(16).toString('hex');
  refs.set(token, { buffer, mimeType, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function getCursorRef(token: string): { buffer: Buffer; mimeType: string } | null {
  const entry = refs.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    refs.delete(token);
    return null;
  }
  return { buffer: entry.buffer, mimeType: entry.mimeType };
}
