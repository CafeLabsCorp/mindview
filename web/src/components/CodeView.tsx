// Highlighted, read-only view of a text asset (.sh, .json, .yaml, .html
// source…). Loaded lazily from AssetViewer, so highlight.js only reaches the
// bundle the first time someone opens a code file.
import hljs from 'highlight.js/lib/common';
import dos from 'highlight.js/lib/languages/dos';
import powershell from 'highlight.js/lib/languages/powershell';

hljs.registerLanguage('dos', dos);
hljs.registerLanguage('powershell', powershell);

const LANGUAGE_BY_EXT: Record<string, string> = {
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', env: 'bash',
  ps1: 'powershell', bat: 'dos', cmd: 'dos',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', lua: 'lua', sql: 'sql',
  json: 'json', jsonc: 'json', canvas: 'json',
  yaml: 'yaml', yml: 'yaml', base: 'yaml', // Obsidian .base files are YAML
  toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini',
  xml: 'xml', html: 'xml', htm: 'xml', svg: 'xml',
  css: 'css', scss: 'scss',
};

/** Highlighting is synchronous and some grammars backtrack badly on
 * pathological input — past this, show plain text rather than freeze. */
const MAX_HIGHLIGHT_CHARS = 200_000;

export default function CodeView({ text, ext }: { text: string; ext: string }) {
  const language = text.length <= MAX_HIGHLIGHT_CHARS ? LANGUAGE_BY_EXT[ext] : undefined;
  // hljs.highlight() HTML-escapes the source and only adds its own <span
  // class="hljs-…"> wrappers, so its output is safe to inject — this is the
  // one dangerouslySetInnerHTML in the app, and it never sees raw vault HTML.
  const html = language ? hljs.highlight(text, { language, ignoreIllegals: true }).value : null;
  return (
    <pre className="code-view">
      {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{text}</code>}
    </pre>
  );
}
