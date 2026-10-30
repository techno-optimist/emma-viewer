#!/usr/bin/env node
// Writes (or with --check verifies) SHA256SUMS for the files a family would
// download: the viewer and the spec. `shasum -a 256 -c SHA256SUMS` checks them.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lines = ['emma-viewer.html', 'SPEC.md'].map(name => `${createHash('sha256').update(readFileSync(join(root, name))).digest('hex')}  ${name}`);
const text = lines.join('\n') + '\n';
if (process.argv.includes('--write')) { writeFileSync(join(root, 'SHA256SUMS'), text); console.log(text.trim()); }
else {
  let current = ''; try { current = readFileSync(join(root, 'SHA256SUMS'), 'utf8'); } catch {}
  if (current === text) console.log('SHA256SUMS is current'); else { console.error('SHA256SUMS is stale; run: node tools/sha256sums.mjs --write'); process.exit(1); }
}
