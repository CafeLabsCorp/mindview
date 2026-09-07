import { useEffect, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import type { AppState, NodeResponse } from '../api/types';
import { TerminalChrome } from '../components/TerminalChrome';
import { FrontmatterCard } from '../components/FrontmatterCard';
import { MarkdownBody } from '../components/MarkdownBody';
import { TocPanel } from '../components/TocPanel';
import { BacklinksPanel } from '../components/BacklinksPanel';
import { NodeToolbar } from '../components/NodeToolbar';
import { useSettings } from '../context/SettingsContext';
import { useBumpAppState } from '../context/AppStateEvents';
import { loadTocCollapsed, saveTocCollapsed } from '../lib/tocCollapsed';
import { useT } from '../i18n/useT';

export function Reader({ path }: { path: string | null }) {
  const { data, loading, error } = useApi<NodeResponse>(path ? `/node?path=${encodeURIComponent(path)}` : null);
  const { data: state } = useApi<AppState>('/state');
  const { settings } = useSettings();
  const t = useT();
  const bump = useBumpAppState();

  const [tocCollapsed, setTocCollapsed] = useState(loadTocCollapsed);
  const toggleToc = () => {
    setTocCollapsed((c) => {
      saveTocCollapsed(!c);
      return !c;
    });
  };

  // GET /api/node (above) is what the server records into Recentes. That
  // used to leave every OTHER screen's own /state copy stale (Sidebar's
  // "Fixados"/"Recentes" needed a reload to catch up) — bumping the shared
  // app-state version here means every useApi('/state') call, in any
  // component, refetches together.
  //
  // bumpedForPath guards against a real infinite loop: bump() increments
  // appStateVersion, which is itself one of THIS hook's own useApi
  // dependencies (see useApi.ts) — so an unconditional bump on every `data`
  // change re-triggers this exact node fetch, which produces a new `data`
  // object (fresh JSON.parse), which re-fires this effect, forever. Firing
  // bump() at most once per distinct `path` breaks the cycle.
  const bumpedForPath = useRef<string | null>(null);
  useEffect(() => {
    if (data && bumpedForPath.current !== path) {
      bumpedForPath.current = path;
      bump();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, path]);

  if (!path) {
    return (
      <div className="reader-screen">
        <TerminalChrome path={t('chrome.root')} />
        <div className="reader-empty">{t('reader.empty')}</div>
      </div>
    );
  }

  const isPinned = state?.pinnedNodes.includes(path) ?? false;
  const togglePin = () => api.post('/state/pin', { path }).then(bump);
  const tocAvailable = !!data && settings.tocEnabled && data.node.headings.length > 0;

  return (
    <div className="reader-screen">
      <TerminalChrome path={`${t('chrome.root')}/${path}`} />
      <div className="reader-layout">
        <div className="reader-article-col">
          {/* !data guard: bumpedForPath above still causes one background
              refetch of this same node right after it first loads (the
              appStateVersion bump is also a useApi dependency for this
              fetch) — without the guard, "Carregando…" would flash on top
              of content that's already on screen. */}
          {loading && !data && <p style={{ color: 'var(--subtle)' }}>{t('common.loading')}</p>}
          {error && <div className="error-banner">{error}</div>}
          {data && (
            <div style={{ maxWidth: 'var(--read-col)', width: '100%' }}>
              <NodeToolbar
                obsidian={data.obsidian}
                vscode={data.vscode}
                isPinned={isPinned}
                onTogglePin={togglePin}
                showTocToggle={tocAvailable}
                tocCollapsed={tocCollapsed}
                onToggleToc={toggleToc}
              />
              <h1 style={{ fontFamily: 'var(--font-display)' }}>{data.node.title}</h1>
              <FrontmatterCard tags={data.node.tags} criado={data.node.criado} atualizado={data.node.atualizado} />
              <MarkdownBody raw={data.node.raw} headings={data.node.headings} links={data.node.links} />
              <BacklinksPanel backlinks={data.backlinks} />
            </div>
          )}
        </div>
        {data && tocAvailable && !tocCollapsed && (
          <div className="reader-rail">
            <div className="reader-rail-head">
              <span className="sidebar-section-label">{t('reader.toc')}</span>
              <button className="icon-btn" title={t('reader.hideToc')} onClick={toggleToc}>
                ›
              </button>
            </div>
            <TocPanel headings={data.node.headings} />
          </div>
        )}
      </div>
    </div>
  );
}
