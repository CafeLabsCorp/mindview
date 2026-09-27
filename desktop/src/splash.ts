// What the window shows while the server boots — so opening the app paints
// something at once instead of nothing for a second or more. Inline and
// self-contained (a data: URL): no file to package, no request to make, and
// it can't depend on the server that isn't up yet. Same background as the
// BrowserWindow and the app, so the swap to the real page doesn't flash.
const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>MindView</title>
<style>
  html, body { margin: 0; height: 100%; background: #0d0d0d; color: #e6edf3;
    font-family: 'Segoe UI', system-ui, sans-serif; }
  body { display: flex; align-items: center; justify-content: center; }
  .box { display: flex; flex-direction: column; align-items: center; gap: 18px; }
  .name { font-size: 22px; font-weight: 600; letter-spacing: .02em; }
  .name b { color: #3fb950; font-weight: 600; }
  .bar { width: 160px; height: 2px; border-radius: 2px; background: #21262d; overflow: hidden; }
  .bar::after { content: ''; display: block; width: 40%; height: 100%; background: #3fb950;
    animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
  @media (prefers-reduced-motion: reduce) { .bar::after { animation: none; width: 100%; opacity: .5; } }
</style>
</head>
<body><div class="box"><div class="name">Mind<b>View</b></div><div class="bar"></div></div></body>
</html>`;

export const SPLASH_URL = `data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`;
