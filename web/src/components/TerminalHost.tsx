import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TerminalView } from './TerminalView';
import { useTerminalDock } from '../context/TerminalDock';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n/useT';

// Keeps every terminal session mounted, for as long as its tab exists, and
// decides where its DOM sits: the Terminal page's slot, a hidden parking
// spot (while another page is open), or a balloon window. The DOM is MOVED
// with appendChild — React doesn't care where a portal's container lives —
// and never re-rendered into a new container: changing a portal's target
// remounts it, which would close the socket and kill the shell.
//
// Lazy-loaded by App (it pulls in xterm through TerminalView), and only
// once a session has been started.
export default function TerminalHost() {
  const { sessions, pageSlot, popouts } = useTerminalDock();
  const { settings } = useSettings();
  const { tabs, activeId } = sessions;

  // One stable container per session, created once, never replaced.
  const shells = useRef(new Map<number, HTMLDivElement>());
  const shellFor = (id: number): HTMLDivElement => {
    let el = shells.current.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'terminal-shell';
      shells.current.set(id, el);
    }
    return el;
  };

  const parking = useMemo(() => {
    const el = document.createElement('div');
    el.className = 'terminal-parking';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }, []);
  useEffect(() => {
    document.body.appendChild(parking);
    return () => parking.remove();
  }, [parking]);

  // The slot inside each balloon, reported by its chrome once rendered.
  const [popSlots, setPopSlots] = useState(new Map<number, HTMLElement>());
  // One STABLE ref callback per session: an inline arrow would be a new
  // function every render, which React calls with null then the element
  // each time — a state update per render, forever.
  const slotRefs = useRef(new Map<number, (el: HTMLElement | null) => void>());
  const slotRefFor = (id: number) => {
    let cb = slotRefs.current.get(id);
    if (!cb) {
      cb = (el) =>
        setPopSlots((prev) => {
          if (el ? prev.get(id) === el : !prev.has(id)) return prev;
          const next = new Map(prev);
          if (el) next.set(id, el);
          else next.delete(id);
          return next;
        });
      slotRefs.current.set(id, cb);
    }
    return cb;
  };

  // Place every session. Runs after each render, before paint.
  useLayoutEffect(() => {
    for (const tab of tabs) {
      const el = shellFor(tab.id);
      const target = (tab.poppedOut && popSlots.get(tab.id)) || pageSlot || parking;
      if (el.parentNode !== target) target.appendChild(el);
    }
    // sessions that ended: drop their containers
    const alive = new Set(tabs.map((t) => t.id));
    for (const [id, el] of shells.current) {
      if (!alive.has(id)) {
        el.remove();
        shells.current.delete(id);
      }
    }
  });

  // A balloon closing (any way) must hand its session back BEFORE its
  // document goes away — synchronously, inside pagehide.
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const [id, p] of popouts) {
      const rescue = () => {
        const el = shells.current.get(id);
        if (el && el.ownerDocument !== document) parking.appendChild(el);
        setPopSlots((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      };
      // The balloon coming forward (Ctrl+`, or a click on its window) puts
      // the keyboard in the terminal — not on whatever button was clicked
      // last, like ⊤ (v0.2.1 retest, R.3). xterm reads keys from its hidden
      // helper textarea.
      const focusTerminal = () => {
        const input = shells.current.get(id)?.querySelector<HTMLTextAreaElement>('textarea.xterm-helper-textarea');
        if (input && p.win.document.activeElement !== input) input.focus();
      };
      p.win.addEventListener('pagehide', rescue);
      p.win.addEventListener('focus', focusTerminal);
      cleanups.push(() => {
        p.win.removeEventListener('pagehide', rescue);
        p.win.removeEventListener('focus', focusTerminal);
      });
    }
    return () => cleanups.forEach((c) => c());
  }, [popouts, parking]);

  return (
    <>
      {tabs.map((tab) => {
        const popSlot = tab.poppedOut ? popSlots.get(tab.id) : undefined;
        const placement = popSlot ? `pop` : pageSlot ? 'page' : 'parked';
        return createPortal(
          <TerminalView
            active={!!popSlot || (!!pageSlot && tab.id === activeId)}
            placement={placement}
            fontSize={settings.terminalFontSize}
            restartKey={tab.restartKey}
            onStatus={(status, detail) => sessions.setStatus(tab.id, status, detail)}
          />,
          shellFor(tab.id),
          `view-${tab.id}`,
        );
      })}
      {[...popouts].map(([id, p]) =>
        createPortal(
          <PopoutChrome id={id} onSlot={slotRefFor(id)} />,
          p.win.document.body,
          `pop-${id}`,
        ),
      )}
    </>
  );
}

/** The balloon's own header: which session, keep-on-top (desktop), back
 * to the page, end. Rendered by React into the balloon's document. */
function PopoutChrome({ id, onSlot }: { id: number; onSlot: (el: HTMLElement | null) => void }) {
  const t = useT();
  const { sessions, popouts, dockBack, setOnTop } = useTerminalDock();
  const index = sessions.tabs.findIndex((tab) => tab.id === id);
  const tab = sessions.tabs[index];
  const popout = popouts.get(id);
  if (!tab || !popout) return null;
  const canPin = !!window.mindviewDesktop?.setPopoutOnTop;

  return (
    <div className="terminal-popout">
      <header className="terminal-popout-head">
        <span className={`terminal-tab-dot is-${tab.status}`} aria-hidden="true" />
        <span className="terminal-popout-title mono">{t('terminal.tab', { n: index + 1 })}</span>
        <span className={`terminal-panel-status is-${tab.status}`}>{tab.detail}</span>
        <div className="terminal-panel-actions">
          {canPin && (
            <button
              className={`terminal-action${popout.onTop ? ' is-on' : ''}`}
              onClick={() => setOnTop(id, !popout.onTop)}
              aria-pressed={popout.onTop}
              title={popout.onTop ? t('terminal.onTopOn') : t('terminal.onTopOff')}
            >
              ⊤
            </button>
          )}
          <button className="terminal-action" onClick={() => dockBack(id)} title={t('terminal.dockBack')} aria-label={t('terminal.dockBack')}>
            ⇲
          </button>
          <button className="terminal-action" onClick={() => sessions.close(id)} title={t('terminal.endSession')} aria-label={t('terminal.endSession')}>
            ✕
          </button>
        </div>
      </header>
      <div className="terminal-popout-slot" ref={onSlot} />
    </div>
  );
}
