// Deterministic, fictional test vectors for emma-viewer (library part).
//
// Everything here is invented. Salts and nonces are derived from the vector's
// name, so the committed files can be reproduced byte for byte. Real .emma
// writers use fresh random salts and nonces; fixed values are acceptable only
// for public test vectors that protect nothing.
import { createHash, pbkdf2Sync, createCipheriv } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const ITERATIONS = 600000;
const PASSPHRASE = 'lantern-notebook-fixture';
const UNICODE_PASSPHRASE = '  Fixture café 🪷 é phrase  ';
const WRONG_PASSPHRASE = 'not-the-fixture-passphrase';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const utf8 = text => Buffer.from(text, 'utf8');
const label = (name, kind, length) => createHash('sha256').update(`emma-viewer fixture ${kind} ${name}`).digest().subarray(0, length);
const uuid = (block, n) => `00000000-0000-4000-8000-0000000${block}${String(n).padStart(4, '0')}`;

function deriveKey(passphrase, salt, iterations) {
  return pbkdf2Sync(utf8(passphrase), salt, iterations, 32, 'sha256');
}

// EMMA/2.0: 54 header bytes as AAD, AES-256-GCM, 16-byte tag appended.
function sealV2(name, plaintext, passphrase, { iterations = ITERATIONS, version = [2, 0], magic = 'EMMA' } = {}) {
  const header = Buffer.alloc(54);
  header.write(magic, 0, 'ascii');
  header[4] = version[0]; header[5] = version[1];
  header.writeUInt32BE(iterations, 6);
  label(name, 'salt', 32).copy(header, 10);
  label(name, 'nonce', 12).copy(header, 42);
  const key = deriveKey(passphrase, header.subarray(10, 42), iterations);
  const cipher = createCipheriv('aes-256-gcm', key, header.subarray(42, 54), { authTagLength: 16 });
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { file: Buffer.concat([header, ciphertext, cipher.getAuthTag()]), key };
}

// Recovered EMMA 1.0: magic, 01 00, salt at 6, nonce at 38, ciphertext at 50,
// PBKDF2 100000 iterations, no AAD. The header is not authenticated.
function sealV1(name, plaintext, passphrase) {
  const salt = label(name, 'salt', 32), nonce = label(name, 'nonce', 12);
  const key = deriveKey(passphrase, salt, 100000);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const header = Buffer.alloc(50);
  header.write('EMMA', 0, 'ascii'); header[4] = 1; header[5] = 0;
  salt.copy(header, 6); nonce.copy(header, 38);
  return { file: Buffer.concat([header, ciphertext, cipher.getAuthTag()]), key };
}

// ---------------------------------------------------------------- media ----
function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}
// A 64x64 PNG with four flat colour blocks: a fixture picture, not a photo.
function tinyPNG() {
  const size = 64, half = size / 2;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const colours = [[0x2f, 0x6f, 0xb5], [0xf2, 0xb8, 0x4b], [0x7a, 0xc9, 0x9a], [0xe0, 0x6c, 0x5a]];
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = [0];
    for (let x = 0; x < size; x += 1) row.push(...colours[(y < half ? 0 : 2) + (x < half ? 0 : 1)]);
    rows.push(Buffer.from(row));
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(Buffer.concat(rows))), pngChunk('IEND', Buffer.alloc(0))]);
}
// A quarter second of a soft 440 Hz tone, 8 kHz, 16-bit mono WAV.
function tinyWAV() {
  const rate = 8000, samples = 2000, data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const fade = Math.min(1, i / 200, (samples - i) / 200);
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 6000 * fade), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii'); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii'); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
// Structure only: an MP4 "ftyp" box and an empty "mdat". Browsers will not
// play it; the viewer only needs a video/mp4 attachment to hand to <video>.
function tinyMP4() {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0); ftyp.write('ftypisom', 4, 'ascii'); ftyp.writeUInt32BE(512, 12); ftyp.write('isomiso2', 16, 'ascii');
  const mdat = Buffer.alloc(8); mdat.writeUInt32BE(8, 0); mdat.write('mdat', 4, 'ascii');
  return Buffer.concat([ftyp, mdat]);
}

// ------------------------------------------------------------ web vault ----
const T = {
  vaultCreated: '2026-03-01T09:00:00.000Z', vaultUpdated: '2026-10-20T18:30:00.000Z',
  m1: '2026-03-01T09:05:00.000Z', m2: '2026-04-12T16:20:00.000Z', m3: '2026-05-03T11:00:00.000Z',
  m4: '2026-06-15T19:45:00.000Z', m5: '2026-07-07T07:07:07.000Z', m6: '2026-08-01T12:00:00.000Z',
  m6Trashed: '2026-10-10T10:00:00.000Z', m7: '2026-09-09T09:09:09.000Z', doc: '2026-10-02T12:00:00.000Z'
};
const source = (overrides = {}) => ({ kind: 'manual', reference: 'Written in Emma', creator: 'Rowan Fixture', capturedAt: T.m1, ...overrides });
const consent = (overrides = {}) => ({ status: 'granted', by: 'Rowan Fixture', note: 'Fixture consent record. Fictional.', recordedAt: T.m1, ...overrides });

function webMemories() {
  const png = tinyPNG(), wav = tinyWAV(), mp4 = tinyMP4();
  const memory = (n, fields) => { const id = uuid('a', n); return [id, { id, ...fields }]; };
  return Object.fromEntries([
    memory(1, { title: 'The blue recipe notebook', created: T.m1, updated: T.m1, trashedAt: null,
      content: 'Fixture story: Rowan remembers a handwritten notebook that lived beside the kitchen radio. On rainy Saturdays the family chose a recipe together and made a small, happy mess.',
      source: source({ documentDate: '2019-05' }), consent: consent(),
      people: ['Rowan Fixture', 'Mira Fixture'], tags: ['kitchen', 'fixture'],
      attachments: [{ name: 'notebook-colours.png', type: 'image/png', data: png.toString('base64') }] }),
    memory(2, { title: 'A quiet walk by the water', created: T.m2, updated: T.m2, trashedAt: null,
      content: 'Fixture story: Mira tells of an afternoon walk, a thermos of tea, and the sound of boats returning to the harbour. The date is uncertain, and that is recorded without correcting the story.',
      source: source({ kind: 'import', reference: 'Fixture import — walk.txt', creator: 'Mira Fixture', capturedAt: T.m2, evidenceKind: 'observation', confidence: 'medium' }),
      consent: { status: 'unknown', by: '', note: '', recordedAt: T.m2 },
      people: ['Mira Fixture'], tags: ['walk', 'fixture'], attachments: [] }),
    memory(3, { title: 'A tone from the garden (fixture audio)', created: T.m3, updated: T.m3, trashedAt: null,
      content: 'Fixture story: a quarter second of a soft tone stands in for a recording that was never made.',
      source: source({ capturedAt: T.m3 }), consent: consent({ recordedAt: T.m3 }), people: [], tags: ['fixture'],
      attachments: [{ name: 'garden-tone.wav', type: 'audio/wav', data: wav.toString('base64') }] }),
    memory(4, { title: 'Harbour film (fixture video, structure only)', created: T.m4, updated: T.m4, trashedAt: null,
      content: 'Fixture story: the attached file has the shape of a video and no pictures in it.',
      source: source({ capturedAt: T.m4 }), consent: consent({ recordedAt: T.m4 }), people: [], tags: ['fixture'],
      attachments: [{ name: 'harbour.mp4', type: 'video/mp4', data: mp4.toString('base64') }] }),
    memory(5, { title: 'Exactness check', created: T.m5, updated: T.m5, trashedAt: null,
      content: 'Exact text test: é and é stay distinct, tabs\tstay tabs,  double  spaces stay, <b>angle brackets</b> are text, and the line ends with a newline.\n',
      source: source({ capturedAt: T.m5, documentDate: '2021-12-31' }), consent: consent({ status: 'withdrawn', note: 'Fixture withdrawal record.', recordedAt: T.m5 }),
      people: [], tags: ['exactness'], attachments: [] }),
    memory(6, { title: 'An entry the owner removed', created: T.m6, updated: T.m6Trashed, trashedAt: T.m6Trashed,
      content: 'Fixture story: this memory was moved to Trash by the owner and is kept, not erased.',
      source: source({ capturedAt: T.m6 }), consent: consent({ recordedAt: T.m6 }), people: ['Rowan Fixture'], tags: ['fixture'], attachments: [] }),
    memory(7, { title: 'With fields this viewer does not know', created: T.m7, updated: T.m7, trashedAt: null,
      content: 'Fixture story: this memory carries extra fields that a plain copy keeps and the viewer does not interpret.',
      source: source({ capturedAt: T.m7 }), consent: consent({ recordedAt: T.m7 }), people: [], tags: ['fixture'], attachments: [],
      mood: 'calm (opaque fixture field)',
      localProposalReceipt: { proposalId: uuid('e', 1), memoryId: uuid('a', 7), vaultId: uuid('f', 3), approvedAt: T.m7 } })
  ]);
}

function identityDocuments() {
  const version = (id, number, text, extra = {}) => ({ id, number, originalText: text, scope: { mode: 'private' },
    provenance: { reference: 'Fixture document', creator: 'Rowan Fixture', capturedAt: T.doc, originalName: extra.originalName ?? 'PROFILE.md' },
    review: { by: 'Rowan Fixture', at: T.doc }, createdAt: T.doc, ...extra.fields });
  return { schema: 'emma-identity-documents/1', documents: {
    'fixture-profile': { id: 'fixture-profile', kind: 'profile', name: 'Fixture profile', versions: [
      version('fixture-profile-r1', 1, '# A fictional profile\n\nFirst draft. Likes lanterns.\n'),
      version('fixture-profile-r2', 2, '# A fictional profile\n\nSecond draft. Likes lanterns and harbours.\n')] },
    'fixture-horizon': { id: 'fixture-horizon', kind: 'horizon', name: 'Fixture horizon', versions: [
      version('fixture-horizon-r1', 1, 'A direction the fictional owner may choose: learn to sail.\n', { originalName: 'HORIZON.md',
        fields: { horizonEndorsements: [{ id: 'fixture-endorse-1', versionId: 'fixture-horizon-r1', status: 'endorsed', by: 'Rowan Fixture', at: T.doc }] } })] },
    'owner-legacy-wishes': { id: 'owner-legacy-wishes', kind: 'other', name: 'Legacy wishes.md', versions: [
      version('fixture-wishes-r1', 1, 'Fixture wishes: please read these stories aloud at the lantern festival. (Fictional.)\n', { originalName: 'Legacy wishes.md' })] }
  } };
}

function webVault3() {
  return { schema: 'emma-local-vault/3', version: '3.0', id: uuid('f', 3), name: 'Lantern family vault (fixture)',
    created: T.vaultCreated, updated: T.vaultUpdated,
    content: { memories: webMemories(), people: {}, media: {}, relationships: {}, settings: { theme: 'lantern (opaque fixture field)' }, identityDocuments: identityDocuments() },
    recovery: { warnings: ['Fixture warning: this vault is invented test data.'], legacy: null } };
}
function webVault2() {
  const all = webMemories();
  const pick = id => { const { trashedAt, ...rest } = all[id]; return rest; };
  return { schema: 'emma-local-vault/2', version: '2.0', id: uuid('f', 2), name: 'Older lantern vault (fixture, payload /2)',
    created: T.vaultCreated, updated: T.m2,
    content: { memories: { [uuid('a', 1)]: pick(uuid('a', 1)), [uuid('a', 2)]: pick(uuid('a', 2)) }, people: {}, media: {}, relationships: {}, settings: {} },
    recovery: { warnings: [], legacy: null } };
}
function webVaultEmpty() {
  return { schema: 'emma-local-vault/3', version: '3.0', id: uuid('f', 4), name: 'Empty vault (fixture)', created: T.vaultCreated, updated: T.vaultCreated,
    content: { memories: {}, people: {}, media: {}, relationships: {}, settings: {} }, recovery: { warnings: [], legacy: null } };
}
function legacyVault1() {
  return { version: '1.0', name: 'Legacy fixture vault', content: {
    memories: {
      'old-1': { content: 'Fixture legacy story one: a lantern on the old pier.', metadata: { title: 'Old lantern', tags: ['legacy', 'fixture'], people: ['Rowan Fixture'] },
        created: '2024-01-02T03:04:05.000Z', updated: '2024-01-02T03:04:05.000Z' },
      'old-2': { content: { text: 'Fixture legacy story two, with structured content.' }, title: 'Second old story', created: '2024-02-03T04:05:06.000Z' },
      'old-3': { content: '', metadata: { title: 'Photo only (fixture)' }, attachments: ['photo-1'], created: '2024-03-04T05:06:07.000Z' }
    },
    media: { 'photo-1': { type: 'image/png', note: 'Fixture: bytes were lost in the original export.' } } } };
}

// --------------------------------------------------------- native vault ----
// Mirrors NativeMemoryVault.vault(_:id:name:created:updated:) in EmmaCore.
// createdAt is seconds since 2001-01-01T00:00:00Z, as Swift's JSONEncoder
// writes a Date by default. The archive is the record; the rest is a mirror.
const REFERENCE_OFFSET = 978307200;
const iso = referenceSeconds => new Date((referenceSeconds + REFERENCE_OFFSET) * 1000).toISOString();
const R = { n1: 760000000.5, n2: 760000001, n3: 760000002.25, n4: 760000003, n5: 760000004, n6: 760000005.75, n7: 760000006, recollected: 760000100 };

function nativeRows(includeAttributed) {
  const rows = [
    { id: uuid('b', 1), text: 'Fixture then: the lantern café on the corner, where é and é stay distinct.', createdAt: R.n1,
      metadata: { perspective: 'past', eventDate: '2020-02-29', voice: 'ownerWords' } },
    { id: uuid('b', 2), text: 'Fixture now: a present observation written with help.', sourceRequestID: uuid('c', 1), sourceOrigin: 'https://fixture.example.test',
      createdAt: R.n2, metadata: { perspective: 'present', voice: 'assisted' } },
    { id: uuid('b', 3), text: 'Fixture someday: a hope to visit a moon garden 🪷.', createdAt: R.n3, metadata: { perspective: 'future', eventDate: '2027-04-12', voice: 'other' } },
    { id: uuid('b', 4), text: 'Unspecified stays unknown.', createdAt: R.n4 }
  ];
  if (includeAttributed) rows.push(
    { id: uuid('b', 5), text: 'Fixture words written by Mira about the harbour.', createdAt: R.n5, metadata: { perspective: 'past', voice: 'other' }, attribution: { kind: 'relative', personID: uuid('d', 1) } },
    { id: uuid('b', 6), text: 'Written by someone no longer in People (fixture).', createdAt: R.n6, metadata: { perspective: 'unspecified', voice: 'other' }, attribution: { kind: 'relative', personID: uuid('d', 9) } });
  return rows;
}
function nativePeople(includeAttributed) {
  return [
    { id: uuid('d', 1), name: 'Mira Fixture', relationship: 'sister (fictional)', memoryIDs: includeAttributed ? [uuid('b', 1), uuid('b', 3), uuid('b', 5)] : [uuid('b', 1), uuid('b', 3)] },
    { id: uuid('d', 2), name: 'Rowan Fixture', memoryIDs: [] }
  ];
}
function nativeArchive(version) {
  if (version === 2) return { version: 2, memories: nativeRows(false) };
  if (version === 3) return { version: 3, memories: [nativeRows(false)[0], { id: uuid('b', 7), text: 'A recollection recorded later (fixture).', createdAt: R.n7,
    temporal: { kind: 'source', parents: [], recollectedAt: R.recollected } }] };
  if (version === 4) return { version: 4, memories: nativeRows(false), people: nativePeople(false) };
  if (version === 6) return { version: 6, memories: nativeRows(true), people: nativePeople(true), voiceAttachments: [] };
  throw new Error('unknown archive version');
}
const extensionSchema = version => version === 6 ? 'emma-native-memory/4' : version === 4 ? 'emma-native-memory/3' : version === 3 ? 'emma-native-memory/2' : 'emma-native-memory/1';
export function nativeProjection(archive, id, name, created, updated) {
  const people = Object.fromEntries((archive.people ?? []).map(person => [person.id, person]));
  const memories = {};
  for (const memory of archive.memories) {
    const stamp = iso(memory.createdAt);
    const future = memory.metadata?.perspective === 'future';
    const reference = memory.sourceOrigin ? `${memory.sourceOrigin}/v1/requests/${memory.sourceRequestID}` : 'Saved in Emma';
    memories[memory.id] = { id: memory.id, title: future ? 'Future possibility' : 'Emma memory', content: memory.text, created: stamp, updated: stamp, trashedAt: null,
      source: { kind: memory.sourceRequestID ? 'import' : 'manual', reference, creator: memory.attribution ? `relative:${memory.attribution.personID}` : 'Not recorded', capturedAt: stamp },
      consent: { status: 'unknown', by: '', note: 'Local memory backup; importing grants no agent access.', recordedAt: stamp },
      people: (archive.people ?? []).filter(person => person.memoryIDs.includes(memory.id)).map(person => person.id),
      tags: future ? ['Aspiration, not prediction'] : [], attachments: [] };
  }
  const family = archive.version === 6, includesPeople = archive.version >= 4;
  return { schema: family ? 'emma-local-vault/5' : includesPeople ? 'emma-local-vault/4' : 'emma-local-vault/3', version: family ? '5.0' : includesPeople ? '4.0' : '3.0',
    id, name, created, updated,
    content: { memories, people, media: {}, relationships: {}, settings: {}, nativeMemory: { schema: extensionSchema(archive.version), archive } },
    recovery: { warnings: [], legacy: null } };
}
const nativeVault = (version, n) => nativeProjection(nativeArchive(version), uuid('f', 100 + n), 'Emma memories', '2026-10-01T08:00:00.000Z', '2026-10-21T08:30:00.000Z');

// ---------------------------------------------------------------- build ----
export function buildVectors() {
  const vectors = [], files = new Map();
  function add(name, file, fields) {
    const entry = { file: `${name}.emma`, ...fields, sha256: { file: sha256(file), ...(fields.sha256 ?? {}) } };
    vectors.push(entry); files.set(entry.file, Buffer.from(file));
    return file;
  }
  function positive(name, value, passphrase, facts, { envelope = 'EMMA/2.0' } = {}) {
    const plaintext = utf8(typeof value === 'string' ? value : JSON.stringify(value));
    const { file, key } = envelope === 'EMMA/1.0' ? sealV1(name, plaintext, passphrase) : sealV2(name, plaintext, passphrase);
    return add(name, file, { passphrase, expect: 'open', envelope, ...facts, sha256: { plaintext: sha256(plaintext), derivedKey: sha256(key) } });
  }
  function refusedPayload(name, value, note, passphrase = PASSPHRASE) {
    const plaintext = Buffer.isBuffer(value) ? value : utf8(typeof value === 'string' ? value : JSON.stringify(value));
    const { file, key } = sealV2(name, plaintext, passphrase);
    add(name, file, { passphrase, expect: 'unsupported', envelope: 'EMMA/2.0', note, sha256: { plaintext: sha256(plaintext), derivedKey: sha256(key) } });
  }
  const headerRefused = (name, file, note, passphrase = PASSPHRASE) => add(name, file, { passphrase, expect: 'notEmma', note });
  const unlockRefused = (name, file, note, passphrase = PASSPHRASE) => add(name, file, { passphrase, expect: 'cannotUnlock', note });

  const web3 = positive('web-v3', webVault3(), PASSPHRASE, { payloadSchema: 'emma-local-vault/3', readAs: 'emma-local-vault/3', kind: 'web',
    counts: { memories: 6, removed: 1, people: 2, identityDocuments: 3 }, note: 'Full web vault: attachments (image, audio, video), one memory in Trash, identity documents, opaque fields.' });
  positive('web-v2', webVault2(), UNICODE_PASSPHRASE, { payloadSchema: 'emma-local-vault/2', readAs: 'emma-local-vault/3', kind: 'web',
    counts: { memories: 2, removed: 0, people: 2, identityDocuments: 0 }, note: 'Payload /2, read as /3. Passphrase keeps its spaces, accents and emoji exactly.' });
  positive('web-v3-empty', webVaultEmpty(), PASSPHRASE, { payloadSchema: 'emma-local-vault/3', readAs: 'emma-local-vault/3', kind: 'web',
    counts: { memories: 0, removed: 0, people: 0, identityDocuments: 0 }, note: 'A vault with no memories.' });
  positive('legacy-v1', legacyVault1(), PASSPHRASE, { payloadSchema: 'EMMA/1.0 legacy', readAs: 'legacy', kind: 'legacy',
    counts: { memories: 3, removed: 0, people: 1, identityDocuments: 0 }, note: 'Recovered EMMA 1.0: unauthenticated header, 100000 iterations, no AAD. Read-only with a warning. Media not shown.' }, { envelope: 'EMMA/1.0' });
  positive('native-v3', nativeVault(2, 3), PASSPHRASE, { payloadSchema: 'emma-local-vault/3', readAs: 'emma-local-vault/3', kind: 'native', archiveVersion: 2,
    counts: { memories: 4, removed: 0, people: 0, identityDocuments: 0 }, note: 'Native export, archive version 2 (perspective, event date, voice). Node-made; checked against the Swift reader.' });
  positive('native-v3-temporal', nativeVault(3, 5), PASSPHRASE, { payloadSchema: 'emma-local-vault/3', readAs: 'emma-local-vault/3', kind: 'native', archiveVersion: 3,
    counts: { memories: 2, removed: 0, people: 0, identityDocuments: 0 }, note: 'Native export, archive version 3 with a time-aware source row.' });
  positive('native-v4', nativeVault(4, 4), PASSPHRASE, { payloadSchema: 'emma-local-vault/4', readAs: 'emma-local-vault/4', kind: 'native', archiveVersion: 4,
    counts: { memories: 4, removed: 0, people: 2, identityDocuments: 0 }, note: 'Native export, archive version 4 with People.' });
  positive('native-v5', nativeVault(6, 6), PASSPHRASE, { payloadSchema: 'emma-local-vault/5', readAs: 'emma-local-vault/5', kind: 'native', archiveVersion: 6,
    counts: { memories: 6, removed: 0, people: 2, identityDocuments: 0 }, note: 'Native export, archive version 6 with attribution ("Written by Mira Fixture", "Written by family").' });

  // Negative vectors. Byte flips at the tag, header (salt, nonce) and ciphertext.
  const flip = (bytes, offset) => { const copy = Buffer.from(bytes); copy[offset] ^= 1; return copy; };
  unlockRefused('neg-flipped-tag', flip(web3, web3.length - 1), 'Last byte of the GCM tag flipped.');
  unlockRefused('neg-flipped-header-salt', flip(web3, 10), 'First salt byte flipped: a different key and a failed AAD check.');
  unlockRefused('neg-flipped-header-nonce', flip(web3, 42), 'First nonce byte flipped.');
  unlockRefused('neg-flipped-ciphertext', flip(web3, 60), 'A ciphertext byte flipped.');
  unlockRefused('neg-truncated', web3.subarray(0, web3.length - 1), 'Last byte removed.');
  unlockRefused('neg-appended', Buffer.concat([web3, Buffer.from([0])]), 'One byte appended.');
  unlockRefused('neg-wrong-passphrase', web3, 'The web-v3 bytes with a different passphrase.', WRONG_PASSPHRASE);
  headerRefused('neg-truncated-short', web3.subarray(0, 65), 'Shorter than the smallest possible EMMA/2.0 file.');
  headerRefused('neg-wrong-iterations', sealV2('neg-wrong-iterations', utf8(JSON.stringify(webVaultEmpty())), PASSPHRASE, { iterations: 100000 }).file, 'Header says 100000 iterations. Refused before any key derivation.');
  headerRefused('neg-wrong-version-3-0', sealV2('neg-wrong-version-3-0', utf8(JSON.stringify(webVaultEmpty())), PASSPHRASE, { version: [3, 0] }).file, 'Version bytes 03 00.');
  headerRefused('neg-wrong-version-2-1', sealV2('neg-wrong-version-2-1', utf8(JSON.stringify(webVaultEmpty())), PASSPHRASE, { version: [2, 1] }).file, 'Version bytes 02 01.');
  headerRefused('neg-wrong-magic', sealV2('neg-wrong-magic', utf8(JSON.stringify(webVaultEmpty())), PASSPHRASE, { magic: 'EMMB' }).file, 'Magic bytes are not EMMA.');
  headerRefused('neg-heirloom-like', utf8(JSON.stringify({ schema: 'emma-heirloom-vault/1', vaultID: uuid('f', 9), holders: '1', salt: 'AAAA' })), 'A legacy-mode (heirloom) file is JSON text, not an EMMA envelope. v0.2 scope.');

  // Authenticated payloads the viewer must refuse.
  refusedPayload('neg-duplicate-keys', JSON.stringify(webVaultEmpty()).replace('"name":"Empty vault (fixture)"', '"name":"First","name":"Second"'), 'Duplicate JSON object key "name".');
  refusedPayload('neg-unknown-schema', { ...webVaultEmpty(), schema: 'emma-local-vault/9', version: '9.0' }, 'Unknown payload schema.');
  refusedPayload('neg-device-backup-like', { schema: 'emma-device-local-backup/2', version: '2.0', fixture: true }, 'Device backup schema.');
  refusedPayload('neg-capsule-like', { schema: 'emma-native-experience/1', fixture: true }, 'Experience capsule schema.');
  refusedPayload('neg-reviewed-record-like', { schema: 'emma-native-reviewed-record/1', fixture: true }, 'Reviewed record schema.');
  refusedPayload('neg-not-json', utf8('fixture: not JSON at all'), 'Authenticated plaintext that is not JSON.');
  refusedPayload('neg-invalid-utf8', Buffer.from([0x7b, 0xff, 0xfe, 0x7d]), 'Authenticated plaintext that is not UTF-8.');
  refusedPayload('neg-v4-without-native', { ...webVaultEmpty(), schema: 'emma-local-vault/4', version: '4.0' }, 'Payload /4 without content.nativeMemory.');
  refusedPayload('neg-v5-without-native', { ...webVaultEmpty(), schema: 'emma-local-vault/5', version: '5.0' }, 'Payload /5 without content.nativeMemory.');
  {
    const edited = nativeVault(4, 4);
    edited.content.memories[uuid('b', 1)].content = 'Mirror text edited after export (fixture).';
    refusedPayload('neg-native-mirror-edited', edited, 'Browser mirror no longer matches the native archive.');
    const mismatch = nativeVault(4, 4);
    mismatch.content.nativeMemory.schema = 'emma-native-memory/1';
    refusedPayload('neg-native-schema-mismatch', mismatch, 'nativeMemory.schema does not match the archive version.');
    const extra = nativeVault(2, 3);
    extra.content.settings = { private: 'Do not discard' };
    refusedPayload('neg-native-extra-settings', extra, 'Settings added beside a native archive: a limited reader must not drop them silently.');
    const archiveV5 = nativeVault(4, 4);
    archiveV5.content.nativeMemory.archive.version = 5; archiveV5.content.nativeMemory.archive.voiceAttachments = [];
    refusedPayload('neg-native-archive-v5', archiveV5, 'Archive version 5 (voice) is never accepted in a memory vault.');
  }
  {
    const id = uuid('a', 9);
    const big = webVaultEmpty();
    big.content.memories[id] = { id, title: 'Too long', content: 'a'.repeat(200001), created: T.m1, updated: T.m1, trashedAt: null, source: source(), consent: consent(), people: [], tags: [], attachments: [] };
    refusedPayload('neg-web-oversize-text', big, 'Memory text over the 200,000 code unit bound.');
    const many = webVaultEmpty();
    many.content.memories[id] = { id, title: 'Nine attachments', content: 'Fixture.', created: T.m1, updated: T.m1, trashedAt: null, source: source(), consent: consent(), people: [], tags: [],
      attachments: Array.from({ length: 9 }, (_, i) => ({ name: `tiny-${i}.png`, type: 'image/png', data: tinyPNG().toString('base64') })) };
    refusedPayload('neg-web-too-many-attachments', many, 'Nine attachments on one memory.');
    const svg = webVaultEmpty();
    svg.content.memories[id] = { id, title: 'SVG', content: 'Fixture.', created: T.m1, updated: T.m1, trashedAt: null, source: source(), consent: consent(), people: [], tags: [],
      attachments: [{ name: 'x.svg', type: 'image/svg+xml', data: Buffer.from('<svg/>').toString('base64') }] };
    refusedPayload('neg-web-bad-attachment-type', svg, 'An attachment type outside the image, audio and video allowlist.');
    const deep = webVaultEmpty(); let nest = []; const root = nest;
    for (let i = 0; i < 52; i += 1) { const next = []; nest.push(next); nest = next; }
    deep.content.settings = { deep: root };
    refusedPayload('neg-deep-nesting', deep, 'Nesting deeper than 50 levels.');
    refusedPayload('neg-unsafe-key', JSON.stringify(webVaultEmpty()).replace('"settings":{}', '"settings":{"__proto__":{"polluted":true}}'), 'An unsafe object key.');
    const identity = webVault3(); identity.content.identityDocuments.schema = 'emma-identity-documents/2';
    refusedPayload('neg-identity-schema', identity, 'Unsupported identity document extension version.');
    const legacyBad = { version: '1.0', name: 'Broken legacy fixture', content: { notes: {} } };
    const { file, key } = sealV1('neg-legacy-bad-structure', utf8(JSON.stringify(legacyBad)), PASSPHRASE);
    add('neg-legacy-bad-structure', file, { passphrase: PASSPHRASE, expect: 'unsupported', envelope: 'EMMA/1.0', note: 'EMMA 1.0 without content.memories.', sha256: { plaintext: sha256(utf8(JSON.stringify(legacyBad))), derivedKey: sha256(key) } });
  }

  const manifest = { fixture: true, license: 'CC0-1.0', generator: 'tools/make-fixtures.mjs', iterations: ITERATIONS,
    description: 'Invented test vectors for emma-viewer. No real vault, person, passphrase or recording. Salts and nonces are derived from each name so the files reproduce exactly.',
    errors: { notEmma: 'Refused by the file header, before any key derivation.', cannotUnlock: 'Key derivation ran; authentication failed.', unsupported: 'Authenticated and decrypted, then refused by the payload rules. Nothing is shown.' },
    vectors };
  return { manifest, files };
}

// Oversize: a file one byte over 20 MiB + 70 is refused before any key work.
// It is not stored; tests build it in memory.
export function oversizeFile() {
  const file = Buffer.alloc(20 * 1024 * 1024 + 71, 0);
  file.write('EMMA', 0, 'ascii'); file[4] = 2; file[5] = 0; file.writeUInt32BE(ITERATIONS, 6);
  return file;
}
export { PASSPHRASE, UNICODE_PASSPHRASE, WRONG_PASSPHRASE, ITERATIONS, sha256, deriveKey, nativeArchive, nativeVault, webVault3, webVault2, webVaultEmpty, legacyVault1 };
