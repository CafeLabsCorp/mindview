import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { terminalSocketUrl } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import type { TerminalStatus } from '../lib/terminalSessions';

interface Props {
  /** Hidden tabs stay mounted so their shell keeps running — unmounting
   * would close the socket, and the PTY dies with it. */
  active: boolean;
  fontSize: number;
  /** Bumped by the panel to throw this shell away and start a fresh one,
   * without losing the tab (and its place in the tab strip). */
  restartKey: number;
  onStatus: (status: TerminalStatus, detail: string) => void;
}

/** Reads the live token values rather than hardcoding hexes, so the
 * terminal follows the accent chosen in Ajustes and the app's light/dark
 * switch. Background stays --code-bg (fixed dark in both themes, by
 * design — see styles/tokens.css): a terminal on a white page reads
 * wrong, and those --on-code-* tokens exist for exactly this surface. */
function readXtermTheme(): Record<string, string> {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  const accent = v('--accent', '#3fb950');
  return {
    background: v('--code-bg', '#0a0a0a'),
    foreground: v('--on-code', '#c3c2b7'),
    cursor: accent,
    cursorAccent: v('--code-bg', '#0a0a0a'),
    selectionBackground: 'rgba(255,255,255,0.18)',
    // ANSI set kept in the app's own palette (the tag colours) instead of
    // xterm's defaults, which clash with the Mind identity.
    black: '#1c1c1a',
    red: '#f0655c',
    green: accent,
    yellow: '#e0913a',
    blue: '#45b8c4',
    magenta: '#a78bfa',
    cyan: '#45b8c4',
    white: '#c3c2b7',
    brightBlack: '#8a887f',
    brightRed: '#f0655c',
    brightGreen: accent,
    brightYellow: '#e0913a',
    brightBlue: '#45b8c4',
    brightMagenta: '#e685b5',
    brightCyan: '#45b8c4',
    brightWhite: '#f2f1ec',
  };
}

/** One shell: one xterm instance bound to one WebSocket. Everything about
 * a session's lifetime lives here, so the panel above can treat a tab as
 * an opaque thing that is either mounted (alive) or not (killed). */
export function TerminalView({ active, fontSize, restartKey, onStatus }: Props) {
  const { settings } = useSettings();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  // One effect owns the whole lifecycle (xterm + socket): they are born and
  // die together, and splitting them into two effects would let a stale
  // socket write into a disposed terminal on remount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: readXtermTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const ws = new WebSocket(terminalSocketUrl(term.cols, term.rows));
    ws.binaryType = 'arraybuffer';

    // stream:true matters: a UTF-8 character can be split across two
    // frames, and decoding each chunk independently would print garbage.
    const decoder = new TextDecoder('utf-8');

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data) as { t?: string; message?: string; shell?: string; cwd?: string; exitCode?: number; mode?: string };
          if (msg.t === 'ready') {
            statusRef.current('ready', msg.mode === 'command' ? `${msg.cwd ?? ''}` : `${msg.shell ?? ''} · ${msg.cwd ?? ''}`);
          } else if (msg.t === 'exit') {
            // 127 is the shell's "command not found". Saying so beats
            // echoing a bare exit code the reader has to look up — and it
            // is the exact case of someone who hasn't installed Claude
            // Code yet.
            statusRef.current(
              'exited',
              msg.exitCode === 127
                ? 'comando não encontrado nesta máquina — instale-o, ou troque o "comando ao abrir" nos Ajustes'
                : `sessão encerrada (código ${msg.exitCode ?? 0})`,
            );
          } else if (msg.t === 'error') {
            statusRef.current('error', msg.message ?? 'erro desconhecido');
          }
        } catch {
          /* not a control message we understand — ignore */
        }
        return;
      }
      term.write(decoder.decode(ev.data as ArrayBuffer, { stream: true }));
    };
    ws.onerror = () => statusRef.current('error', 'não consegui abrir a conexão com o servidor');
    ws.onclose = () => statusRef.current('exited', 'sessão encerrada');

    const disposeData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'input', d: data }));
    });

    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'resize', cols: term.cols, rows: term.rows }));
    };
    const disposeResize = term.onResize(sendResize);

    // The panel is resized by dragging, by window changes, and by being
    // un-hidden — the observer covers all three, where a window 'resize'
    // listener would only catch one.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* host detached mid-teardown */
      }
    });
    observer.observe(host);

    statusRef.current('connecting', 'conectando…');

    return () => {
      observer.disconnect();
      disposeData.dispose();
      disposeResize.dispose();
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [restartKey, fontSize]);

  // Theme/accent changes don't justify tearing the shell down — repaint in
  // place instead, which is why this is a separate effect.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = readXtermTheme();
  }, [settings.accent, settings.theme]);

  // A hidden tab has zero size, so xterm's own dimensions go stale. Refit
  // and refocus on the way back in.
  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
        termRef.current?.focus();
      } catch {
        /* not laid out yet */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [active]);

  return (
    <div className="terminal-view" hidden={!active}>
      <div className="terminal-view-host" ref={hostRef} />
    </div>
  );
}
