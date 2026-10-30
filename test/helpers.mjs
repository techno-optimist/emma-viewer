// Shared test helpers: load the viewer's pure core out of emma-viewer.html.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const viewerPath = join(repoRoot, 'emma-viewer.html');
export const vectorsDir = join(repoRoot, 'fixtures', 'vectors');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function viewerHTML() { return readFileSync(viewerPath, 'utf8'); }

// The single inline script, exactly as the browser sees it.
export function inlineScript(html = viewerHTML()) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw new Error(`expected one inline script, found ${scripts.length}`);
  return scripts[0][1];
}
export function inlineStyle(html = viewerHTML()) {
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  if (styles.length !== 1) throw new Error(`expected one inline style, found ${styles.length}`);
  return styles[0][1];
}

// Run the script with no `document`, so only the pure core is defined.
export function loadCore() {
  const context = vm.createContext({ crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa, URL, Blob, console, setTimeout });
  context.globalThis = context;
  vm.runInContext(inlineScript(), context, { filename: 'emma-viewer.html' });
  return context.EmmaViewer;
}

export function manifest() { return JSON.parse(readFileSync(join(vectorsDir, 'manifest.json'), 'utf8')); }
export function vectorBytes(name) { return new Uint8Array(readFileSync(join(vectorsDir, name))); }
