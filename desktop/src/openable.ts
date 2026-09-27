// Which vault files "Open in default app" may hand to the OS. An ALLOWLIST,
// not a blocklist: shell.openPath on a .bat/.ps1/.lnk/.exe/.sh RUNS it, and
// the list of things Windows will execute on open is long and keeps growing
// (.hta, .scf, .appref-ms, .settingcontent-ms…). Anything not listed here
// can still be revealed in its folder, where the user acts deliberately.
//
// Also left out on purpose (security review, 2026-09-27): formats that
// carry macros or have a history of open-time exploits — doc/xls/ppt (VBA),
// rtf (CVE-2017-11882 class), odt/ods/odp (LibreOffice macros). A vault
// cloned with git has no Mark-of-the-Web, so Office's macro block doesn't
// kick in; only a banner stands between the file and its macros. And svg:
// the OS opens it in a browser on file://, where its script runs — MindView
// shows SVGs itself anyway.
//
// Shared by preload.ts (to decide whether to show the button) and main.ts
// (which enforces it — the page's answer is never trusted).
const OPENABLE = new Set([
  // documents (the macro-free OOXML formats; .docm/.xlsm are not here)
  'pdf', 'docx', 'txt', 'epub',
  'xlsx', 'csv', 'tsv',
  'pptx', 'key',
  // images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'psd', 'fig',
  // media
  'mp3', 'wav', 'flac', 'ogg', 'm4a', 'mp4', 'mov', 'mkv', 'webm', 'avi',
  // archives (opening one browses it; it doesn't run anything)
  'zip', '7z', 'rar', 'tar', 'gz',
]);

export function canOpenExternally(ext: string): boolean {
  return OPENABLE.has(ext.toLowerCase());
}
