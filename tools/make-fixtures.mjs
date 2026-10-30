#!/usr/bin/env node
// Writes (or, with --check, verifies) the committed test vectors.
//   node tools/make-fixtures.mjs          writes fixtures/vectors/
//   node tools/make-fixtures.mjs --check  verifies the committed vectors match
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildVectors } from './fixtures-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'fixtures', 'vectors');
const check = process.argv.includes('--check');
const { manifest, files } = buildVectors();
const manifestPath = join(outDir, 'manifest.json');
// Reading hashes are recorded separately (tools/record-readings.mjs); compare the rest.
const withoutReadings = m => JSON.stringify({ ...m, vectors: m.vectors.map(v => ({ ...v, sha256: { ...v.sha256, reading: undefined } })) });

mkdirSync(outDir, { recursive: true });
let mismatches = 0;
for (const [name, bytes] of files) {
  const path = join(outDir, name);
  if (!check) { writeFileSync(path, bytes); continue; }
  if (!existsSync(path) || !readFileSync(path).equals(bytes)) { mismatches += 1; console.error(`MISMATCH ${name}`); }
}
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
if (check) {
  if (!previous || withoutReadings(previous) !== withoutReadings(manifest)) { mismatches += 1; console.error('MISMATCH manifest.json'); }
  for (const existing of readdirSync(outDir)) if (existing.endsWith('.emma') && !files.has(existing)) { mismatches += 1; console.error(`UNEXPECTED ${existing}`); }
  console.log(mismatches ? `${mismatches} mismatch(es)` : `${files.size} vectors match the generator`);
  process.exit(mismatches ? 1 : 0);
}
if (previous) for (const v of manifest.vectors) {
  const old = previous.vectors.find(o => o.file === v.file && o.passphrase === v.passphrase && o.sha256.file === v.sha256.file);
  if (old?.sha256?.reading) v.sha256.reading = old.sha256.reading;
}
for (const existing of readdirSync(outDir)) if (existing.endsWith('.emma') && !files.has(existing)) unlinkSync(join(outDir, existing));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${files.size} vectors and manifest.json to fixtures/vectors/`);
