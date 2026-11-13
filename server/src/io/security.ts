import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** One random token per process run, required as `?token=` on every request. */
export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Per-response nonce for the one inline script (the token injection). */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/** CSP for the SPA page, the one that holds the token. The only inline
 * script is the token injection, allowed by a per-response nonce. Inline
 * styles stay allowed (React `style=` and xterm set them at runtime); PDFs
 * render in a blob: iframe. Everything else is same-origin. */
export function pageCsp(nonce: string, port: number): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ws://127.0.0.1:${port} ws://localhost:${port}`,
    "frame-src blob:",
    "object-src blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);

/** Anti DNS-rebinding: only accept requests whose Host header names this
 * machine's loopback address on the port we're bound to. */
export function isHostAllowed(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  const [host, portStr] = hostHeader.split(':');
  if (!ALLOWED_HOSTS.has(host)) return false;
  const reqPort = portStr ? Number(portStr) : 80;
  return reqPort === port;
}

/** Length-checked constant-time compare. The token now gates a shell, not
 * just note reading, so the timing side-channel is worth closing even
 * though exploiting it over loopback would be impractical. */
export function tokenMatches(candidate: string | null | undefined, expected: string): boolean {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function tokenFromRequest(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '/', 'http://internal');
  return url.searchParams.get('token');
}

export function rejectUnauthorized(res: ServerResponse, reason: string): void {
  res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`403 forbidden: ${reason}`);
}
