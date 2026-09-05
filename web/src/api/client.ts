// Every request to the server must carry `?token=` (server/src/io/security.ts
// checks it on all of /api/*). The token is injected into this page's HTML
// at serve time — see vite.config.ts (dev) / server/src/index.ts (built) —
// never fetched separately, never typed by hand.
const TOKEN = window.__MV_TOKEN__ ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function withToken(path: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('token', TOKEN);
  return url.pathname + '?' + url.searchParams.toString();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withToken(`/api${path}`), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      /* non-JSON error body, keep statusText */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** For direct browser navigation (e.g. `<a href>` downloads) rather than
   * fetch() — the server sets Content-Disposition on the response, so the
   * browser handles the save itself; see backup export in SettingsScreen. */
  rawUrl: (path: string) => withToken(`/api${path}`),
};

/** EventSource can't send custom headers, so the token has to travel as a
 * query param here too — same rule as every other /api/* request. */
export function openEventStream(): EventSource {
  return new EventSource(withToken('/api/events'));
}

export function hasToken(): boolean {
  return TOKEN.length > 0;
}
