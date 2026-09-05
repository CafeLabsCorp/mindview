// A ~40-line manual router — no framework, same minimalist spirit as the
// rest of the backend (io/*.ts). The app has ~20 endpoints, all flat REST
// shapes; a dependency would buy nothing here.
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Handler = (ctx: {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
}) => Promise<void> | void;

interface Route {
  method: string;
  segments: string[]; // e.g. ['api', 'notebooks', ':key']
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): void {
    this.routes.push({ method, segments: pattern.split('/').filter(Boolean), handler });
  }

  get(pattern: string, handler: Handler): void {
    this.add('GET', pattern, handler);
  }
  post(pattern: string, handler: Handler): void {
    this.add('POST', pattern, handler);
  }
  put(pattern: string, handler: Handler): void {
    this.add('PUT', pattern, handler);
  }
  patch(pattern: string, handler: Handler): void {
    this.add('PATCH', pattern, handler);
  }
  delete(pattern: string, handler: Handler): void {
    this.add('DELETE', pattern, handler);
  }

  /** Returns null when nothing matches (caller sends 404). */
  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    const pathSegments = pathname.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== pathSegments.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(pathSegments[i]);
        } else if (seg !== pathSegments[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }
}
