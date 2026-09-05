import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** One random token per process run, required as `?token=` on every request. */
export function generateToken(): string {
  return randomBytes(24).toString('base64url');
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

export function tokenFromRequest(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '/', 'http://internal');
  return url.searchParams.get('token');
}

export function rejectUnauthorized(res: ServerResponse, reason: string): void {
  res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`403 forbidden: ${reason}`);
}
