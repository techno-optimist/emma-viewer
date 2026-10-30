// Gates: no network or storage capability in the viewer, no real names in the
// test material, CSP hashes and SHA256SUMS that match the committed file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { viewerHTML, inlineScript, inlineStyle, repoRoot, sha256 } from './helpers.mjs';

const html = viewerHTML();

test('the viewer has no network, storage, clipboard or dynamic-code capability', () => {
  const forbidden = [/\bfetch\b/, /XMLHttpRequest/, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /\beval\b/, /new Function/, /localStorage/, /sessionStorage/,
    /indexedDB/, /navigator\.clipboard/, /WebSocket/, /sendBeacon/, /EventSource/, /document\.cookie/, /\bimport\(/, /serviceWorker/, /postMessage/, /window\.open/,
    /https?:\/\//, /\bsrc=/, /javascript:/, /<iframe/, /<object/, /<embed/, /<link[^>]+stylesheet/, /\son[a-z]+=/i, /\sstyle=/];
  for (const pattern of forbidden) assert.ok(!pattern.test(html), `emma-viewer.html matches ${pattern}`);
});

test('one inline script, one inline style, no external references', () => {
  assert.equal([...html.matchAll(/<script/g)].length, 1);
  assert.equal([...html.matchAll(/<style/g)].length, 1);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /img-src blob: data:/);
  assert.match(html, /media-src blob:/);
  assert.doesNotMatch(html, /'unsafe-inline'|'unsafe-eval'|'unsafe-hashes'/);
});

test('the CSP hashes match the inline script and style', () => {
  const hash = text => createHash('sha256').update(text, 'utf8').digest('base64');
  assert.match(html, new RegExp(`script-src 'sha256-${hash(inlineScript(html)).replace(/[+/=]/g, '\\$&')}'`));
  assert.match(html, new RegExp(`style-src 'sha256-${hash(inlineStyle(html)).replace(/[+/=]/g, '\\$&')}'`));
});

test('SHA256SUMS records the committed viewer and spec', () => {
  const sums = readFileSync(join(repoRoot, 'SHA256SUMS'), 'utf8');
  for (const name of ['emma-viewer.html', 'SPEC.md']) {
    const expected = sha256(readFileSync(join(repoRoot, name)));
    assert.ok(sums.includes(`${expected}  ${name}`), `${name} ${expected}`);
  }
});

test('no real name or machine path in the viewer, spec, fixtures, tools or tests', () => {
  const names = readFileSync(join(repoRoot, 'test', 'forbidden-names.txt'), 'utf8').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const roots = ['emma-viewer.html', 'SPEC.md', 'SHA256SUMS', 'package.json', 'fixtures', 'tools', 'test', 'python'];
  const files = [];
  const walk = path => {
    const stats = statSync(path);
    if (stats.isDirectory()) { for (const entry of readdirSync(path)) if (!['node_modules', '.venv', '__pycache__'].includes(entry)) walk(join(path, entry)); }
    else files.push(path);
  };
  for (const root of roots) walk(join(repoRoot, root));
  assert.ok(files.length > 40);
  for (const file of files) {
    // Encrypted vectors are random bytes; their plaintext is covered by the
    // generator source and the recorded readings, which are scanned here.
    if (file.endsWith('forbidden-names.txt') || file.endsWith('.emma')) continue;
    const text = readFileSync(file, 'utf8');
    for (const name of names) {
      const pattern = /^[a-z]/i.test(name) && !name.includes('/') ? new RegExp(`\\b${name}\\b`, 'i') : new RegExp(name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'i');
      assert.ok(!pattern.test(text), `${relative(repoRoot, file)} contains ${name}`);
    }
  }
});

test('the fixtures declare themselves fictional', () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'fixtures', 'vectors', 'manifest.json'), 'utf8'));
  assert.equal(manifest.fixture, true);
  assert.equal(manifest.license, 'CC0-1.0');
  assert.ok(manifest.vectors.length >= 40);
  for (const vector of manifest.vectors) assert.ok(['open', 'notEmma', 'cannotUnlock', 'unsupported'].includes(vector.expect));
});
