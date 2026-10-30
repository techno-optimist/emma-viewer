#!/usr/bin/env node
// Records one canonical reading per openable vector: the memories.md text the
// viewer produces, saved under fixtures/readings/, with its SHA-256 written
// into manifest.json. Review the .md files by eye before committing them;
// the golden test then pins the viewer to exactly these readings.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadCore, manifest, vectorBytes, vectorsDir, repoRoot, sha256 } from '../test/helpers.mjs';

const core = loadCore();
const current = manifest();
const readingsDir = join(repoRoot, 'fixtures', 'readings');
mkdirSync(readingsDir, { recursive: true });
let changed = 0;
for (const vector of current.vectors) {
  if (vector.expect !== 'open') continue;
  const bytes = vectorBytes(vector.file);
  const { reading, facts } = await core.open(bytes, vector.passphrase);
  const markdown = core.toMarkdown(reading, { name: vector.file, sha256: sha256(bytes), envelope: facts.envelope });
  const hash = sha256(markdown);
  const path = join(readingsDir, vector.file.replace(/\.emma$/, '.md'));
  let previous = null;
  try { previous = readFileSync(path, 'utf8'); } catch {}
  if (previous !== markdown || vector.sha256.reading !== hash) { changed += 1; console.log(`recorded ${vector.file} -> ${hash}`); }
  writeFileSync(path, markdown);
  vector.sha256.reading = hash;
}
writeFileSync(join(vectorsDir, 'manifest.json'), JSON.stringify(current, null, 2) + '\n');
console.log(changed ? `${changed} reading(s) changed` : 'readings unchanged');
