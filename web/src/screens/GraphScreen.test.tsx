// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings, VaultGraph } from '../api/types';
import { DEFAULT_GRAPH_PREFS } from '../lib/graphPrefs';
import { FALLBACK_SETTINGS } from '../context/SettingsContext';

// --- fixtures --------------------------------------------------------------
const GRAPH: VaultGraph = {
  nodes: [
    { path: 'a.md', title: 'Alpha', tags: ['proj', 'proj/alpha'], kind: 'mind-node', isIndex: true, backlinkCount: 3 },
    { path: 'b.md', title: 'Beta', tags: ['proj'], kind: 'mind-node', isIndex: false, backlinkCount: 1 },
    { path: 'c.md', title: 'Gamma', tags: ['vida'], kind: 'mind-node', isIndex: false, backlinkCount: 0 },
  ],
  edges: [
    { from: 'a.md', to: 'b.md' },
    { from: 'a.md', to: 'c.md' },
  ],
};
// Spread the real defaults rather than re-listing every field: this
// fixture used to be a hand-copied literal and broke the moment Settings
// grew the terminal knobs.
const SETTINGS: Settings = { ...FALLBACK_SETTINGS, accent: '#3fb950', bodyFont: "'Inter',sans-serif" };

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
}

let root: Root;
let container: HTMLDivElement;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  (window as unknown as { __MV_TOKEN__: string }).__MV_TOKEN__ = 'test-token';
  localStorage.clear();

  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO);

  class ES {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    onmessage: unknown = null;
    onerror: unknown = null;
  }
  vi.stubGlobal('EventSource', ES);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/api/graph')) return jsonResponse(GRAPH);
      if (url.includes('/api/settings')) return jsonResponse(SETTINGS);
      if (url.includes('/api/state')) return jsonResponse({ recentVaultPaths: [], recentNodes: [], pinnedNodes: [] });
      return jsonResponse({});
    }),
  );

  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderGraph(prefsOverride: Partial<typeof DEFAULT_GRAPH_PREFS> = {}) {
  if (Object.keys(prefsOverride).length > 0) {
    localStorage.setItem('mindview.graphPrefs.v2', JSON.stringify({ ...DEFAULT_GRAPH_PREFS, ...prefsOverride }));
  }
  const { GraphScreen } = await import('./GraphScreen');
  const { SettingsProvider } = await import('../context/SettingsContext');
  const { ReindexProvider } = await import('../context/ReindexContext');
  const { AppStateEventsProvider } = await import('../context/AppStateEvents');

  await act(async () => {
    root = createRoot(container);
    root.render(
      <StrictMode>
        <SettingsProvider>
          <ReindexProvider>
            <AppStateEventsProvider>
              <GraphScreen />
            </AppStateEventsProvider>
          </ReindexProvider>
        </SettingsProvider>
      </StrictMode>,
    );
  });
  // let the fetch resolve + a few animation frames run
  await act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });
}

describe('GraphScreen', () => {
  it('renders nodes after the simulation loop runs (survives StrictMode mount/unmount/mount)', async () => {
    await renderGraph();
    const nodes = container.querySelectorAll('.graph-node');
    // 3 files + 3 distinct tags (proj, proj/alpha, vida) all present by default
    expect(nodes.length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector('.graph-controls')).not.toBeNull();
    expect(container.querySelector('.graph-toolbar')).not.toBeNull();
  });

  it('drops tag nodes when the "tags como nós" filter is turned off', async () => {
    await renderGraph();
    const tagLabels = () =>
      [...container.querySelectorAll('.graph-node-label')].map((n) => n.textContent ?? '').filter((t) => t.startsWith('#'));
    expect(tagLabels().length).toBeGreaterThan(0); // tags are nodes by default

    const toggle = [...container.querySelectorAll('.gc-check')].find((l) => l.textContent?.includes('tags como nós'));
    const box = toggle?.querySelector('input') as HTMLInputElement;
    await act(async () => {
      box.click();
      await new Promise((r) => setTimeout(r, 500)); // let the exit animation finish
    });
    expect(tagLabels()).toEqual([]);
    expect(container.querySelectorAll('.graph-node').length).toBe(3); // the 3 files remain
  });

  it('paints tag nodes in the tag colour (not the background) and rings them', async () => {
    await renderGraph();
    const tagRings = container.querySelectorAll('.graph-tag-ring');
    expect(tagRings.length).toBeGreaterThan(0);
    const fills = [...container.querySelectorAll('.graph-node.is-tag .graph-node-dot')].map((c) =>
      c.getAttribute('fill'),
    );
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.every((f) => f && f !== 'var(--bg)')).toBe(true);
  });

  it('lists the panels in the Aparência → Filtros → Grupos order', async () => {
    await renderGraph();
    const heads = [...container.querySelectorAll('.gc-section-head')].map((b) => b.textContent?.replace('▸', '').trim());
    expect(heads).toEqual(['Aparência', 'Filtros', 'Grupos']);
  });

  it('"Restaurar padrão" puts every graph pref back to its default', async () => {
    await renderGraph();
    const toggle = [...container.querySelectorAll('.gc-check')].find((l) => l.textContent?.includes('órfãos'));
    const box = toggle?.querySelector('input') as HTMLInputElement;
    await act(async () => {
      box.click();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(box.checked).toBe(false);
    expect(JSON.parse(localStorage.getItem('mindview.graphPrefs.v2')!).showOrphans).toBe(false);

    const reset = container.querySelector('.gc-reset') as HTMLButtonElement;
    await act(async () => {
      reset.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(JSON.parse(localStorage.getItem('mindview.graphPrefs.v2')!)).toEqual(DEFAULT_GRAPH_PREFS);
  });

  it('hovering labels ONLY the node under the cursor, not its neighbours', async () => {
    await renderGraph();
    // zoomed out, the fade threshold keeps every label at 0
    // label opacity is an inline style (a stylesheet rule would beat the SVG
    // `opacity` attribute — that was the "hover reveals every name" bug)
    const labels = () =>
      [...container.querySelectorAll('.graph-node-label')].map((t) => ({
        text: t.textContent,
        op: Number((t as SVGElement).style.opacity || 0),
      }));
    const visible = () => labels().filter((l) => l.op > 0.5).map((l) => l.text);
    expect(visible()).toEqual([]);

    // a.md is the hub here: linked to b.md and c.md, and carries 2 tags
    const hub = [...container.querySelectorAll('.graph-node')].find(
      (g) => g.querySelector('.graph-node-label')?.textContent === 'Alpha',
    )!;
    await act(async () => {
      // React synthesises onPointerEnter from a bubbling `pointerover`
      hub.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(visible()).toEqual(['Alpha']);
    // and every OTHER label stays fully invisible, neighbours included
    expect(labels().filter((l) => l.text !== 'Alpha').every((l) => l.op === 0)).toBe(true);
  });

  it('the restart button empties the graph and grows it back node by node', async () => {
    // a deliberately slow stagger so "partway through" is unambiguous
    await renderGraph({ revealStepMs: 150 });
    const drawn = () => container.querySelectorAll('.graph-node').length;
    const before = drawn();
    expect(before).toBeGreaterThan(3);

    const restart = [...container.querySelectorAll('.graph-toolbar button')].find(
      (b) => b.getAttribute('title') === 'reiniciar simulação',
    ) as HTMLButtonElement;
    expect(restart).toBeDefined();

    // partway through the stagger only some nodes are back on screen
    await act(async () => {
      restart.click();
      await new Promise((r) => setTimeout(r, 200));
    });
    const midway = drawn();
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(before);

    // and once the whole schedule has run, everything is back
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });
    expect(drawn()).toBe(before);
  });

  it('a zero stagger brings the whole graph back at once', async () => {
    await renderGraph({ revealStepMs: 0 });
    const drawn = () => container.querySelectorAll('.graph-node').length;
    const before = drawn();
    const restart = [...container.querySelectorAll('.graph-toolbar button')].find(
      (b) => b.getAttribute('title') === 'reiniciar simulação',
    ) as HTMLButtonElement;
    await act(async () => {
      restart.click();
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(drawn()).toBe(before);
  });
});
