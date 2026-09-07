import { useId, useState } from 'react';
import type { GraphGroup, GraphPrefs } from '../lib/graphPrefs';
import { useT } from '../i18n/useT';
import type { MessageKey } from '../i18n';
import {
  loadPanelCollapsed,
  loadSectionOpen,
  savePanelCollapsed,
  saveSectionOpen,
} from '../lib/graphPanelState';

const GROUP_SWATCHES = ['#e06c75', '#d19a66', '#61afef', '#c678dd', '#56b6c2', '#e5c07b'];

interface Props {
  prefs: GraphPrefs;
  setPref: <K extends keyof GraphPrefs>(key: K, value: GraphPrefs[K]) => void;
  onReset: () => void;
  nodeCount: number;
  edgeCount: number;
}

/* `id` is what the open/closed state is filed under, kept separate from the
   title so renaming a section does not silently reset it. `defaultOpen` only
   applies until the user touches the section for the first time. */
function Section({
  id,
  title,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: MessageKey;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(() => loadSectionOpen(id, defaultOpen));
  const toggle = () =>
    setOpen((o) => {
      saveSectionOpen(id, !o);
      return !o;
    });
  return (
    <div className="gc-section">
      <button className="gc-section-head" onClick={toggle} aria-expanded={open}>
        <span className={`gc-caret${open ? ' is-open' : ''}`}>▸</span>
        {t(title)}
      </button>
      <div className="gc-section-body" data-open={open || undefined}>
        <div className="gc-section-inner">
          <div className="gc-section-pad">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="gc-slider">
      <label htmlFor={id}>
        {label}
        <span className="gc-slider-val">{format ? format(value) : value.toFixed(1)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function GraphControls({ prefs, setPref, onReset, nodeCount, edgeCount }: Props) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(loadPanelCollapsed);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      savePanelCollapsed(!c);
      return !c;
    });

  const setGroup = (id: string, patch: Partial<GraphGroup>) =>
    setPref(
      'groups',
      prefs.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    );
  const addGroup = () =>
    setPref('groups', [
      ...prefs.groups,
      {
        id: `g${Date.now().toString(36)}`,
        query: '',
        color: GROUP_SWATCHES[prefs.groups.length % GROUP_SWATCHES.length],
      },
    ]);
  const removeGroup = (id: string) => setPref('groups', prefs.groups.filter((g) => g.id !== id));

  return (
    <div className={`graph-controls${collapsed ? ' is-collapsed' : ''}`}>
      {/* the whole bar toggles, not just the caret — same affordance as the
          section heads below */}
      <button className="gc-head" onClick={toggleCollapsed} aria-expanded={!collapsed}>
        <span className="gc-title">{t('graph.title')}</span>
        <span className="gc-count">{t('graph.counts', { nodes: nodeCount, edges: edgeCount })}</span>
        <span className={`gc-caret${collapsed ? '' : ' is-open'}`}>▸</span>
      </button>

      <div className="gc-body" data-open={!collapsed || undefined}>
        <div className="gc-body-inner">
          <Section id="aparencia" title="graph.appearance">
            <label className="gc-check">
              <input
                type="checkbox"
                checked={prefs.colorEnabled}
                onChange={(e) => setPref('colorEnabled', e.target.checked)}
              />
              {t('graph.colorByTag')}
            </label>
            <p className="gc-hint gc-sub">
              {prefs.colorEnabled ? t('graph.colorOnHint') : t('graph.colorOffHint')}
            </p>
            <label className="gc-check">
              <input
                type="checkbox"
                checked={prefs.sizeByBacklinks}
                onChange={(e) => setPref('sizeByBacklinks', e.target.checked)}
              />
              {t('graph.sizeByBacklinks')}
            </label>
            <label className="gc-check">
              <input type="checkbox" checked={prefs.arrows} onChange={(e) => setPref('arrows', e.target.checked)} />
              {t('graph.arrows')}
            </label>
            <Slider
              label={t('graph.nodeSize')}
              value={prefs.nodeSizeMul}
              min={0.5}
              max={2.2}
              step={0.1}
              onChange={(v) => setPref('nodeSizeMul', v)}
              format={(v) => `${v.toFixed(1)}×`}
            />
            {/* depends on "tags como nós", so it dims when that is off — but it
                stays flush with the sliders above and below it, not indented */}
            <div className="gc-dep" data-off={!prefs.showTags || undefined}>
              <Slider
                label={t('graph.tagSize')}
                value={prefs.tagNodeSize}
                min={2}
                max={12}
                step={0.5}
                onChange={(v) => setPref('tagNodeSize', v)}
                format={(v) => `${v.toFixed(1)}`}
              />
            </div>
            <Slider
              label={t('graph.linkThickness')}
              value={prefs.linkThickness}
              min={0.4}
              max={3}
              step={0.1}
              onChange={(v) => setPref('linkThickness', v)}
              format={(v) => `${v.toFixed(1)}×`}
            />
            <Slider
              label={t('graph.labelThreshold')}
              value={prefs.textFadeThreshold}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setPref('textFadeThreshold', v)}
              format={(v) => (v === 0 ? t('graph.labelAlways') : `${Math.round(v * 100)}%`)}
            />
            <Slider
              label={t('graph.revealStep')}
              value={prefs.revealStepMs}
              min={0}
              max={150}
              step={5}
              onChange={(v) => setPref('revealStepMs', v)}
              format={(v) => (v === 0 ? t('graph.revealAtOnce') : t('graph.revealMs', { value: v }))}
            />
            <p className="gc-hint gc-sub">
              {prefs.revealStepMs === 0
                ? t('graph.revealHintAtOnce')
                : t('graph.revealHintStaged', {
                    nodes: nodeCount,
                    seconds: ((nodeCount * prefs.revealStepMs) / 1000).toFixed(1),
                  })}
            </p>
          </Section>

          <Section id="filtros" title="graph.filters">
            <input
              className="gc-search"
              type="search"
              placeholder={t('graph.searchPlaceholder')}
              value={prefs.search}
              onChange={(e) => setPref('search', e.target.value)}
            />
            <label className="gc-check">
              <input type="checkbox" checked={prefs.showTags} onChange={(e) => setPref('showTags', e.target.checked)} />
              {t('graph.tagsAsNodes')}
            </label>
            <label className="gc-check">
              <input
                type="checkbox"
                checked={prefs.showOrphans}
                onChange={(e) => setPref('showOrphans', e.target.checked)}
              />
              {t('graph.orphans')}
            </label>
          </Section>

          <Section id="grupos" title="graph.groups" defaultOpen={false}>
            {prefs.groups.length === 0 && (
              <p className="gc-hint">
                {t('graph.groupsHint')} <code>tag:cafelabs</code>
              </p>
            )}
            {prefs.groups.map((g) => (
              <div className="gc-group" key={g.id}>
                <input
                  type="color"
                  value={g.color}
                  onChange={(e) => setGroup(g.id, { color: e.target.value })}
                  aria-label={t('graph.groupColor')}
                />
                <input
                  type="text"
                  value={g.query}
                  placeholder={t('graph.groupQuery')}
                  onChange={(e) => setGroup(g.id, { query: e.target.value })}
                />
                <button className="gc-group-x" onClick={() => removeGroup(g.id)} title={t('graph.removeGroup')}>
                  ×
                </button>
              </div>
            ))}
            <button className="gc-add" onClick={addGroup}>
              {t('graph.addGroup')}
            </button>
          </Section>

          <div className="gc-footer">
            <button className="gc-reset" onClick={onReset}>
              {t('graph.reset')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
