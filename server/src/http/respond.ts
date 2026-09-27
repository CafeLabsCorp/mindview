import type { IncomingMessage, ServerResponse } from 'node:http';

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    // Deliberately no Access-Control-Allow-* headers anywhere in this
    // server — see server/src/io/security.ts and the composition root's
    // top comment. Cross-origin dev access goes through Vite's proxy
    // instead, which is a same-process hop, not a browser CORS grant.
  });
  res.end(text);
}

export class HttpError extends Error {
  /** `code`, when set, is a stable key the web UI translates; `message` stays
   * the English fallback for anything that doesn't know the code. */
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB — generous for a notebook/settings PUT, nowhere near vault-sized

export function readJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
  // JSON only. A non-JSON Content-Type (text/plain, form) is what a
  // cross-origin page can send without a CORS preflight — requiring
  // application/json forces one, which this server never answers.
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
    return Promise.reject(new HttpError(415, 'request body must be application/json'));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new HttpError(400, 'invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
