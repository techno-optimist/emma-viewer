#!/usr/bin/env node
// Prints the CSP hashes of the inline <script> and <style> in emma-viewer.html.
// With --write, puts them into the Content-Security-Policy meta tag. This is a
// maintenance helper for a hand-written file, not a build step: the published
// file is the HTML as committed.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'emma-viewer.html');
const html = readFileSync(path, 'utf8');
const one = (pattern, what) => { const m = [...html.matchAll(pattern)]; if (m.length !== 1) throw new Error(`expected one ${what}`); return m[0][1]; };
const hash = text => createHash('sha256').update(text, 'utf8').digest('base64');
const script = hash(one(/<script>([\s\S]*?)<\/script>/g, 'script'));
const style = hash(one(/<style>([\s\S]*?)<\/style>/g, 'style'));
console.log(`script-src 'sha256-${script}'`);
console.log(`style-src 'sha256-${style}'`);
if (process.argv.includes('--write')) {
  const updated = html
    .replace(/script-src 'sha256-[^']*'/, `script-src 'sha256-${script}'`)
    .replace(/style-src 'sha256-[^']*'/, `style-src 'sha256-${style}'`);
  if (updated !== html) { writeFileSync(path, updated); console.log('updated the meta tag'); } else console.log('meta tag already current');
}
