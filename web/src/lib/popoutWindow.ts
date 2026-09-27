// Opens the window a terminal "balloon" lives in, and dresses it with the
// app's styles. The terminal's DOM is then MOVED into it (see TerminalHost)
// — never recreated — so the shell behind it keeps running. That only works
// if the new window shares this page's JavaScript context, which is true
// for all three routes below:
//
//   desktop  window.open('about:blank', 'mv-term-<id>') — the Electron main
//            process recognises the frame name and makes it a small,
//            frameless-menu, always-on-top window (desktop/src/main.ts).
//   Chrome   Document Picture-in-Picture: always on top by nature.
//   other    a plain popup window (not on top — the browser won't allow it).
//
// Must be called from a user gesture (click / pointerup): both window.open
// popups and Picture-in-Picture require one.

export const POPOUT_NAME_PREFIX = 'mv-term-';

export interface PopoutPosition {
  /** screen coordinates, where the tab was dropped */
  x: number;
  y: number;
}

const WIDTH = 720;
const HEIGHT = 440;

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

function docPip(): DocumentPictureInPicture | null {
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null;
}

/** True when the balloon can float above other apps (and toggle it, on
 * desktop). A plain browser popup can't. */
export function popoutFloats(): boolean {
  return !!window.mindviewDesktop || !!docPip();
}

export async function openPopoutWindow(id: number, at?: PopoutPosition): Promise<Window | null> {
  let win: Window | null = null;
  if (!window.mindviewDesktop && docPip()) {
    try {
      win = await docPip()!.requestWindow({ width: WIDTH, height: HEIGHT });
    } catch {
      win = null; // no user activation, or refused — fall through to a popup
    }
  }
  if (!win) {
    const pos = at ? `,left=${Math.round(at.x - 60)},top=${Math.round(at.y - 16)}` : '';
    win = window.open('about:blank', `${POPOUT_NAME_PREFIX}${id}`, `popup,width=${WIDTH},height=${HEIGHT}${pos}`);
  }
  if (!win) return null;
  dressDocument(win.document);
  return win;
}

/** Copies what makes a document look like the app: stylesheets (by
 * absolute URL — an about:blank document has no useful base), and the
 * root's attributes and inline style, which is where the theme and the
 * tokens from Ajustes live (SettingsContext.applyTokensToDom). */
function dressDocument(doc: Document): void {
  doc.title = 'MindView — terminal';
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    const clone = node.cloneNode(true) as HTMLElement;
    if (clone instanceof HTMLLinkElement) clone.href = (node as HTMLLinkElement).href;
    doc.head.appendChild(clone);
  }
  syncRootAttributes(doc);
  doc.body.className = 'terminal-popout-body';
}

/** Re-applied whenever the main root changes (theme switch, accent…). */
export function syncRootAttributes(doc: Document): void {
  const from = document.documentElement;
  const to = doc.documentElement;
  for (const attr of Array.from(to.attributes)) if (!from.hasAttribute(attr.name)) to.removeAttribute(attr.name);
  for (const attr of Array.from(from.attributes)) to.setAttribute(attr.name, attr.value);
}
