// The "Open in Obsidian / VS Code" buttons are plain <a href="obsidian://…">.
// will-navigate refuses anything off the loopback origin, so without an
// explicit handler these links do nothing inside the app. This is that
// handler, and it is an ALLOWLIST of exactly the two shapes the server builds
// (server/src/io/externalOpen.ts) — never "any vscode:/obsidian: URL": the
// vault is third-party-ish content, and vscode://vscode.git/clone?url=…,
// vscode://…/extension/… or an obsidian:// action URI would run things.
export function isAllowedEditorUri(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (u.protocol === 'obsidian:') {
    // obsidian://open?path=<abs path> — nothing else (no vault=, no commands)
    return u.hostname === 'open' && [...u.searchParams.keys()].join() === 'path' && !!u.searchParams.get('path');
  }
  if (u.protocol === 'vscode:') {
    // vscode://file/<abs path>[:line]  or  vscode://vscode-remote/wsl+<distro>/<abs path>
    if (u.search || u.hash) return false;
    if (u.hostname === 'file') return u.pathname.length > 1;
    return u.hostname === 'vscode-remote' && /^\/wsl\+[\w.-]+\/./.test(u.pathname);
  }
  return false;
}
