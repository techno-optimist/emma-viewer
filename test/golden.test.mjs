// Golden tests: every committed vector opens, or is refused, exactly as the
// manifest records, in both the viewer core and an independent Node reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCore, manifest, vectorBytes, vectorsDir, repoRoot, sha256 } from './helpers.mjs';
import * as reference from './reference-reader.mjs';
import { buildVectors, oversizeFile } from '../tools/fixtures-lib.mjs';

const core = loadCore();
const current = manifest();

test('the committed vectors are exactly what the generator produces', () => {
  const { manifest: rebuilt, files } = buildVectors();
  assert.equal(current.vectors.length, rebuilt.vectors.length);
  for (const vector of rebuilt.vectors) {
    assert.equal(sha256(vectorBytes(vector.file)), vector.sha256.file, vector.file);
    assert.ok(files.get(vector.file).equals(Buffer.from(vectorBytes(vector.file))), vector.file);
  }
});

test('exactly four fixed error strings, with no file content in them', () => {
  assert.deepEqual(Object.keys(core.ERRORS).sort(), ['cannotUnlock', 'notEmma', 'unreadable', 'unsupported']);
  assert.ok(Object.isFrozen(core.ERRORS));
  for (const message of Object.values(core.ERRORS)) assert.match(message, /^[A-Z][^\n]{10,160}\.$/);
});

test('an oversize file is refused by the header check before any key derivation', () => {
  const started = Date.now();
  assert.throws(() => core.inspect(oversizeFile()), error => error.code === 'notEmma');
  assert.ok(Date.now() - started < 2000);
});

for (const vector of current.vectors) {
  test(`${vector.file}: ${vector.expect} (${vector.note || vector.kind})`, async () => {
    const bytes = vectorBytes(vector.file);
    assert.equal(sha256(bytes), vector.sha256.file, 'file hash');
    const file = Buffer.from(bytes);

    // Independent reader, written from SPEC.md with node:crypto.
    if (vector.expect === 'notEmma') {
      assert.throws(() => reference.header(file), reference.RefusedHeader);
    } else if (vector.expect === 'cannotUnlock') {
      assert.throws(() => reference.open(file, vector.passphrase), reference.RefusedUnlock);
    } else {
      const opened = reference.open(file, vector.passphrase);
      assert.equal(sha256(opened.plaintext), vector.sha256.plaintext, 'reference plaintext');
      assert.equal(sha256(opened.key), vector.sha256.derivedKey, 'reference derived key');
    }

    // The viewer core itself.
    let outcome, result = null;
    try { result = await core.open(bytes, vector.passphrase); outcome = 'open'; }
    catch (error) { assert.ok(error instanceof core.ViewerError, `unexpected error type: ${error && error.message}`); outcome = error.code; }
    assert.equal(outcome, vector.expect, 'viewer outcome');
    if (outcome !== 'open') return;

    assert.equal(sha256(result.plaintext), vector.sha256.plaintext, 'viewer plaintext');
    const reading = result.reading;
    assert.equal(reading.kind, vector.kind);
    assert.equal(reading.payloadSchema, vector.payloadSchema);
    assert.equal(reading.readAs, vector.readAs);
    assert.equal(reading.memories.length, vector.counts.memories, 'memories');
    assert.equal(reading.removed.length, vector.counts.removed, 'removed');
    assert.equal(reading.people.length, vector.counts.people, 'people');
    assert.equal(reading.documents.length, vector.counts.identityDocuments, 'identity documents');
    const markdown = core.toMarkdown(reading, { name: vector.file, sha256: vector.sha256.file, envelope: result.facts.envelope });
    assert.equal(sha256(markdown), vector.sha256.reading, 'canonical reading hash');
    const recorded = readFileSync(join(repoRoot, 'fixtures', 'readings', vector.file.replace(/\.emma$/, '.md')), 'utf8');
    assert.equal(markdown, recorded, 'canonical reading text');
  });
}

test('every memory text in web-v3 survives untouched, character for character', async () => {
  const vector = current.vectors.find(v => v.file === 'web-v3.emma');
  const { reading, plaintext } = await core.open(vectorBytes(vector.file), vector.passphrase);
  const payload = JSON.parse(new TextDecoder().decode(plaintext));
  for (const memory of [...reading.memories, ...reading.removed]) assert.equal(memory.text, payload.content.memories[memory.id].content);
  const exact = reading.memories.find(m => m.title === 'Exactness check');
  assert.ok(exact.text.includes('é'));
  assert.ok(exact.text.endsWith('\n'));
  assert.ok(exact.text.includes('<b>angle brackets</b>'));
});

test('native memories come from the archive, never from the mirror', async () => {
  const vector = current.vectors.find(v => v.file === 'native-v5.emma');
  const { reading, plaintext } = await core.open(vectorBytes(vector.file), vector.passphrase);
  const payload = JSON.parse(new TextDecoder().decode(plaintext));
  const archive = payload.content.nativeMemory.archive;
  for (const memory of reading.memories) {
    const row = archive.memories.find(r => r.id === memory.id);
    assert.equal(memory.text, row.text);
    assert.equal(memory.saved, core.referenceSecondsToISO(row.createdAt));
    assert.equal(memory.title, null, 'the mirror title is generated and is not shown');
  }
  const labels = reading.memories.map(m => m.labels.join(' · '));
  assert.ok(labels.includes('Then · Written by Mira Fixture'));
  assert.ok(labels.includes('Written by family'));
  assert.ok(labels.includes('Someday · Aspiration, not prediction · Another person\'s words'));
  assert.ok(labels.includes('Now · agent-assisted'));
});

test('duplicate JSON keys are refused even when the last value would be harmless', () => {
  assert.throws(() => core.parseStrictJSON('{"a":1,"a":1}'), error => error.code === 'unsupported');
  assert.throws(() => core.parseStrictJSON('{"__proto__":{}}'), error => error.code === 'unsupported');
  assert.throws(() => core.parseStrictJSON('[1e400]'), error => error.code === 'unsupported');
  assert.throws(() => core.parseStrictJSON('{"a":1} x'), error => error.code === 'unsupported');
  // Values come from the viewer's realm, so compare their JSON, not their prototypes.
  assert.equal(JSON.stringify(core.parseStrictJSON(' {"a":[1,2.5,-3e2,"\\u00e9\\n",true,false,null]} ').value), JSON.stringify({ a: [1, 2.5, -300, 'é\n', true, false, null] }));
});
