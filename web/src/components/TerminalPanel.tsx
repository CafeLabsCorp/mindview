import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { terminalSocketUrl } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import { clampHeight, MAX_PANEL_HEIGHT, MIN_PANEL_HEIGHT } from '../lib/terminalPanelState';

type Status = 'connecting' | 'ready' | 'exited' | 'error';

interface Props {
  height: number;
  onHeightChange: (px: number) => void;
  onClose: () => void;
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

export function TerminalPanel({ height, onHeightChange, onClose }: Props) {
  const { settings } = useSettings();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [detail, setDetail] = useState<string>('');
  const [generation, setGeneration] = useState(0); // bumped to force a fresh shell

  const fontSize = settings.terminalFontSize;

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
    wsRef.current = ws;

    // stream:true matters: a UTF-8 character can be split across two
    // frames, and decoding each chunk independently would print garbage.
    const decoder = new TextDecoder('utf-8');

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data) as { t?: string; message?: string; shell?: string; cwd?: string; exitCode?: number; mode?: string };
          if (msg.t === 'ready') {
            setStatus('ready');
            setDetail(msg.mode === 'command' ? `${msg.cwd ?? ''}` : `${msg.shell ?? ''} · ${msg.cwd ?? ''}`);
          } else if (msg.t === 'exit') {
            setStatus('exited');
            // 127 is the shell's "command not found". Saying so beats
            // echoing a bare exit code the reader has to look up — and it
            // is the exact case of someone who hasn't installed Claude
            // Code yet.
            setDetail(
              msg.exitCode === 127
                ? 'comando não encontrado nesta máquina — instale-o, ou troque o "comando ao abrir" nos Ajustes'
                : `sessão encerrada (código ${msg.exitCode ?? 0})`,
            );
          } else if (msg.t === 'error') {
            setStatus('error');
            setDetail(msg.message ?? 'erro desconhecido');
          }
        } catch {
          /* not a control message we understand — ignore */
        }
        return;
      }
      term.write(decoder.decode(ev.data as ArrayBuffer, { stream: true }));
    };
    ws.onerror = () => {
      setStatus((s) => (s === 'exited' ? s : 'error'));
      setDetail((d) => d || 'não consegui abrir a conexão com o servidor');
    };
    ws.onclose = () => setStatus((s) => (s === 'ready' || s === 'connecting' ? 'exited' : s));

    const disposeData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'input', d: data }));
    });

    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'resize', cols: term.cols, rows: term.rows }));
    };
    const disposeResize = term.onResize(sendResize);

    // The panel is resized by dragging and by window changes alike, so the
    // observer covers both instead of a window 'resize' listener.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* host detached mid-teardown */
      }
    });
    observer.observe(host);

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
      wsRef.current = null;
    };
  }, [generation, fontSize]);

  // Theme/accent changes don't justify tearing the shell down — repaint in
  // place instead, which is why this is a separate effect.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = readXtermTheme();
  }, [settings.accent, settings.theme]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = height;
      const onMove = (ev: PointerEvent) => onHeightChange(clampHeight(startHeight + (startY - ev.clientY)));
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [height, onHeightChange],
  );

  return (
    <section className="terminal-panel" style={{ height }} aria-label="Terminal">
      <div
        className="terminal-resize-handle"
        onPointerDown={startDrag}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionar o terminal"
        aria-valuenow={height}
        aria-valuemin={MIN_PANEL_HEIGHT}
        aria-valuemax={MAX_PANEL_HEIGHT}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') onHeightChange(clampHeight(height + 24));
          else if (e.key === 'ArrowDown') onHeightChange(clampHeight(height - 24));
        }}
      />
      <header className="terminal-panel-head">
        <span className="terminal-panel-title mono">terminal</span>
        <span className={`terminal-panel-status is-${status}`}>
          {status === 'connecting' && 'conectando…'}
          {status === 'ready' && detail}
          {status === 'exited' && detail}
          {status === 'error' && detail}
        </span>
        <div className="terminal-panel-actions">
          {(status === 'exited' || status === 'error') && (
            <button className="btn btn-ghost btn-sm" onClick={() => setGeneration((g) => g + 1)}>
              reabrir
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar o terminal">
            ✕
          </button>
        </div>
      </header>
      <div className="terminal-panel-body" ref={hostRef} />
    </section>
  );
}

// Default export so App can React.lazy() this module: xterm.js is ~250 KB
// and the terminal is off by default, so most sessions must never pay for
// it. See App.tsx.
export default TerminalPanel;
