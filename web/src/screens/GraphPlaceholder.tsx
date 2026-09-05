import { TerminalChrome } from '../components/TerminalChrome';

/** Deliberately just a placeholder this round — see the task brief: 67
 * files / ~8 real dependency edges doesn't earn a force-directed layout
 * yet (cytoscape.js/d3-force are explicitly not wired up), and the
 * product cycle put the graph last in the queue on purpose. */
export function GraphPlaceholder() {
  return (
    <>
      <TerminalChrome path="~/mind/grafo" />
      <div className="placeholder-screen">
        <div className="glyph">◈</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>Graph — em breve</div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, maxWidth: 360, textAlign: 'center' }}>
          cor por tag mais específica, tamanho por nº de backlinks — depois que houver grafo suficiente pra desenhar.
        </p>
      </div>
    </>
  );
}
