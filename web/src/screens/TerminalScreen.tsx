import { useCallback, useEffect, useRef } from 'react';
import { TerminalChrome } from '../components/TerminalChrome';
import { useTerminalDock } from '../context/TerminalDock';
import { useSettings } from '../context/SettingsContext';
import { navigate } from '../lib/hashRoute';
import { useT } from '../i18n/useT';

/** How far (px) a tab must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 6;

// The terminal as a page of its own (Felipe, 2026-09-27) — it used to be a
// VS Code-style panel under every screen. A tab can be dragged out of the
// window, or popped out with its ⧉ button, into a balloon that floats above
// everything. The sessions themselves live in TerminalHost; this page only
// offers them a slot to be shown in.
export function TerminalScreen() {
  const { settings } = useSettings();
  const t = useT();
  const dock = useTerminalDock();
  const { sessions, popouts } = dock;
  const { tabs, activeId, active } = sessions;
  const enabled = settings.terminalEnabled;

  // Opening the page is what starts a shell when none is running — never
  // anything that happens off-screen.
  useEffect(() => {
    if (enabled) dock.ensureSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const setPageSlot = dock.setPageSlot;
  const slotRef = useCallback((el: HTMLElement | null) => setPageSlot(el), [setPageSlot]);

  if (!enabled) {
    return (
      <div className="terminal-screen">
        <TerminalChrome path={t('terminal.label')} />
        <div className="terminal-screen-off">
          <p>{t('terminal.offBody')}</p>
          <button className="btn btn-primary" onClick={() => navigate('ajustes')}>
            {t('terminal.offCta')}
          </button>
        </div>
      </div>
    );
  }

  const activePopped = !!active?.poppedOut;

  return (
    <div className="terminal-screen">
      <TerminalChrome path={t('terminal.label')} />
      <header className="terminal-panel-head">
        <div className="terminal-tabs" role="tablist" aria-label={t('terminal.sessions')}>
          {tabs.map((tab, i) => (
            <div key={tab.id} className={`terminal-tab${tab.id === activeId ? ' is-active' : ''}${tab.poppedOut ? ' is-popped' : ''}`}>
              <DraggableTabLabel
                selected={tab.id === activeId}
                onActivate={() => {
                  sessions.activate(tab.id);
                  if (tab.poppedOut) popouts.get(tab.id)?.win.focus();
                }}
                onDragOut={(x, y) => dock.popOut(tab.id, { x, y })}
              >
                <span className={`terminal-tab-dot is-${tab.status}`} aria-hidden="true" />
                {t('terminal.tab', { n: i + 1 })}
                {tab.poppedOut && <span className="terminal-tab-badge">{t('terminal.inBalloon')}</span>}
              </DraggableTabLabel>
              <button
                className="terminal-tab-close"
                onClick={() => (tab.poppedOut ? dock.dockBack(tab.id) : dock.popOut(tab.id))}
                aria-label={tab.poppedOut ? t('terminal.dockBack') : t('terminal.popOut')}
                title={tab.poppedOut ? t('terminal.dockBack') : t('terminal.popOut')}
              >
                {tab.poppedOut ? '⇲' : '⧉'}
              </button>
              <button
                className="terminal-tab-close"
                onClick={() => sessions.close(tab.id)}
                aria-label={t('terminal.endSessionAria', { n: i + 1 })}
                title={t('terminal.endSession')}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <span className={`terminal-panel-status is-${active?.status ?? 'connecting'}`}>{active?.detail ?? ''}</span>
        <div className="terminal-panel-actions">
          {active && (active.status === 'exited' || active.status === 'error') && (
            <button className="btn btn-ghost btn-sm" onClick={() => sessions.restart(active.id)}>
              {t('terminal.reopen')}
            </button>
          )}
          <button className="terminal-action" onClick={() => sessions.open()} aria-label={t('terminal.newSessionAria')} title={t('terminal.newSession')}>
            +
          </button>
          <button className="terminal-action" onClick={() => sessions.closeAll()} aria-label={t('terminal.endAll')} title={t('terminal.endAll')}>
            ✕
          </button>
        </div>
      </header>
      <div className="terminal-screen-body">
        {/* Sessions are moved in here by TerminalHost while this page is on
            screen; the active one is visible, the rest hidden. */}
        <div className="terminal-screen-slot" ref={slotRef} />
        {activePopped && (
          <div className="terminal-screen-popped">
            <p>{t('terminal.poppedBody')}</p>
            <button className="btn" onClick={() => active && dock.dockBack(active.id)}>
              {t('terminal.dockBack')}
            </button>
          </div>
        )}
        {tabs.length === 0 && (
          <div className="terminal-screen-popped">
            <button className="btn btn-primary" onClick={() => sessions.open()}>
              {t('terminal.newSession')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A tab label that is a plain click target, until it's dragged: a drag
 * released OUTSIDE the app window pops the tab out at that spot. Pointer
 * capture keeps the events coming while the pointer is off the window. */
function DraggableTabLabel({
  selected,
  onActivate,
  onDragOut,
  children,
}: {
  selected: boolean;
  onActivate: () => void;
  onDragOut: (screenX: number, screenY: number) => void;
  children: React.ReactNode;
}) {
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  return (
    <button
      role="tab"
      aria-selected={selected}
      className="terminal-tab-label mono"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY, dragging: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s && !s.dragging && Math.hypot(e.clientX - s.x, e.clientY - s.y) > DRAG_THRESHOLD) {
          s.dragging = true;
          document.body.classList.add('is-dragging-tab');
        }
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        document.body.classList.remove('is-dragging-tab');
        if (!s) return;
        if (!s.dragging) return onActivate();
        const outside = e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight;
        if (outside) onDragOut(e.screenX, e.screenY);
      }}
      onPointerCancel={() => {
        start.current = null;
        document.body.classList.remove('is-dragging-tab');
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      {children}
    </button>
  );
}
