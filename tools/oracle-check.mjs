#!/usr/bin/env node
// Cross-checks the native vectors against emma's own Swift reader.
//
//   node tools/oracle-check.mjs /path/to/EmmaOfflineReader
//
// Build the reader read-only from an emma checkout, with the build products
// outside that checkout:
//   swift build --package-path <emma>/native --scratch-path /tmp/emma-oracle \
//     --product EmmaOfflineReader -c release
// The reader prints the archive's canonical JSON for an accepted memory vault
// and exits 3 for anything it refuses. Every native vector must be accepted
// byte for byte; every negative native vector and every web vector must be
// refused. Nothing here is needed to run or test the viewer itself.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { nativeArchive, PASSPHRASE } from './fixtures-lib.mjs';

const oracle = process.argv[2];
if (!oracle) { console.error('usage: node tools/oracle-check.mjs /path/to/EmmaOfflineReader'); process.exit(2); }
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'vectors');
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function run(file, passphrase = PASSPHRASE) {
  // The reader takes the passphrase on an inherited descriptor, never as an argument.
  const result = spawnSync('bash', ['-c', 'exec 3< <(printf "%s" "$PASS"); "$ORACLE" --kind memory --input "$FILE" --passphrase-fd 3'],
    { env: { ...process.env, PASS: passphrase, ORACLE: oracle, FILE: file }, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
let failures = 0;
for (const [name, version] of [['native-v3', 2], ['native-v3-temporal', 3], ['native-v4', 4], ['native-v5', 6]]) {
  const r = run(join(dir, `${name}.emma`));
  const ok = r.status === 0 && r.stdout.trim() === canonical(nativeArchive(version));
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: accepted and returned byte for byte (exit ${r.status})`);
}
for (const name of ['neg-native-mirror-edited', 'neg-native-schema-mismatch', 'neg-native-extra-settings', 'neg-native-archive-v5', 'web-v3', 'neg-v4-without-native', 'neg-duplicate-keys']) {
  const r = run(join(dir, `${name}.emma`));
  const ok = r.status === 3 && r.stdout === '';
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: refused (exit ${r.status})`);
}
const wrong = run(join(dir, 'native-v3.emma'), 'not-the-fixture-passphrase');
if (wrong.status !== 3) failures += 1;
console.log(`${wrong.status === 3 ? 'OK  ' : 'FAIL'} wrong passphrase refused (exit ${wrong.status})`);
process.exit(failures ? 1 : 0);
