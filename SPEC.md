# The .emma file, as emma viewer 0.1 reads it

This document and the test vectors under `fixtures/` are released under CC0 1.0
(public domain dedication). The viewer's code is Apache-2.0; see `LICENSE`.

It describes, in plain words and byte tables, exactly which files emma viewer
0.1 opens and how it reads them. It is written from the two readers that make
these files today: the browser reader `vault.js` in the emma web app and
`EmmaCore` in the emma iPhone and Mac app. It is not a universal standard, and
it does not describe files the viewer refuses (device backups, experience
capsules, reviewed records, legacy-mode "heirloom" files). Those are listed in
section 9 so that nobody mistakes a refusal for a damaged file.

All offsets are zero-based. All integers are unsigned big-endian. There is no
compression, no index, no executable content and nothing that points outside
the file.

## 1. Two envelopes

| Envelope | First six bytes | Who writes it | Viewer |
| --- | --- | --- | --- |
| EMMA/2.0 | `45 4d 4d 41 02 00` ("EMMA", 2, 0) | emma web app, emma iPhone and Mac app | opens |
| EMMA/1.0 | `45 4d 4d 41 01 00` ("EMMA", 1, 0) | the recovered 2025 prototype | opens read-only, with a warning |
| anything else | | | refused before any passphrase is used |

## 2. EMMA/2.0 envelope

| Offset | Length | Meaning |
| --- | --- | --- |
| 0 | 4 | ASCII `EMMA` (`45 4d 4d 41`) |
| 4 | 2 | Version bytes, exactly `02 00` |
| 6 | 4 | PBKDF2 iteration count, exactly 600000 (`00 09 27 c0`) |
| 10 | 32 | Salt, random per file |
| 42 | 12 | AES-GCM nonce, random per file |
| 54 | n | Ciphertext |
| 54 + n | 16 | AES-GCM authentication tag |

- A file is at least 70 bytes and at most 20 MiB + 70 bytes (20,971,590).
  Anything else is refused by the header check.
- The passphrase is encoded as UTF-8 exactly as typed: no trimming, no Unicode
  normalization. Spaces, capitals and accents are key material. Readers accept
  1 to 1,024 UTF-16 code units; writers require at least 12.
- Key: PBKDF2-HMAC-SHA-256, the salt above, 600,000 iterations, 256 bits.
- Cipher: AES-256-GCM, the nonce above, 128-bit tag. The exact 54 header bytes
  are the additional authenticated data (AAD), so a changed version, iteration
  count, salt or nonce fails authentication like a changed ciphertext.
- The plaintext is UTF-8 JSON (section 4), at most 20 MiB.
- A failed authentication does not say whether the passphrase or the file was
  wrong. The viewer shows one sentence for both.

The web writer and the native writer produce the same envelope. The native
writer bounds its own payloads more tightly (section 6).

## 3. EMMA/1.0 legacy envelope (read-only)

| Offset | Length | Meaning |
| --- | --- | --- |
| 0 | 4 | ASCII `EMMA` |
| 4 | 2 | Version bytes `01 00` |
| 6 | 32 | Salt |
| 38 | 12 | AES-GCM nonce |
| 50 | n | Ciphertext |
| 50 + n | 16 | AES-GCM authentication tag |

PBKDF2-HMAC-SHA-256 with 100,000 iterations; AES-256-GCM with **no AAD**. The
header is therefore not authenticated. A file is at least 66 bytes. The viewer
shows this notice, taken from emma's format record: the header was not
authenticated; emma's current files use EMMA 2.0. The payload (section 7) is
shown read-only. Media named in a legacy file is not shown: some original
exports had already lost the media bytes, and no reader can rebuild bytes that
are absent.

## 4. Payload parsing rules

The plaintext is decoded as UTF-8 with fatal error handling (any invalid byte
refuses the file) and parsed as JSON with these rules, which are stricter than
a browser's `JSON.parse`:

| Rule | Decision |
| --- | --- |
| Duplicate member names in one object | **Refused.** `JSON.parse` keeps the last value; emma's writers never emit duplicates; a reader cannot know which value the owner meant. Recorded here on 2026-10-29 as this viewer's decision. |
| Member names `__proto__`, `constructor`, `prototype` | Refused (as in `vault.js`) |
| Nesting deeper than 51 containers (web) or 50 (native payloads) | Refused |
| Non-finite or malformed numbers, trailing content, control characters inside strings | Refused |
| Text that is not a single JSON object | Refused |

Nothing from the file ever appears in an error message. There are exactly four
error sentences (section 10).

## 5. Web vault payload: `emma-local-vault/2` and `/3`

Written by the emma web app. The root object:

| Field | Meaning | Rule on read |
| --- | --- | --- |
| `schema` | `"emma-local-vault/3"` with `version` `"3.0"`, or `"emma-local-vault/2"` with `version` `"2.0"` | `/2` is read as `/3`, exactly as `vault.js` does; nothing else is accepted |
| `id` | vault ID | string, 1–200 characters |
| `name` | vault name | string, 1–200 characters, not only whitespace |
| `created`, `updated` | timestamps | any string up to 40 characters that `Date.parse` accepts; shown as ISO 8601 UTC |
| `content.memories` | object keyed by memory ID | at most 2,000 entries; each entry's `id` equals its key |
| `content.people`, `content.media`, `content.relationships`, `content.settings` | objects | must be objects; contents are preserved in a plain copy and not interpreted |
| `content.identityDocuments` | optional extension | validated when present (below) |
| `recovery.warnings` | strings | at most 100, at most 2,000 characters each, at most 32 KiB together; shown as notes recorded in the file |
| `recovery.legacy` | `null` or the preserved original of an imported EMMA/1.0 file | not shown; its presence is noted |

Each memory:

| Field | Rule on read | Default when absent |
| --- | --- | --- |
| `content` | string, at most 200,000 UTF-16 code units; a memory needs text or an attachment | `""` |
| `title` | string, at most 250 | first 80 characters of the text, or "A memory" |
| `created`, `updated` | timestamps as above | the vault's `updated` |
| `trashedAt` | `null`, or a timestamp: the owner moved it to Trash | `null` |
| `source` | object: `kind` (`manual`, `import`, `legacy`), `reference` (≤ 1,000), `creator` (≤ 200), `capturedAt`, optional `documentDate` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), `version`, `evidenceKind` (`observation`, `inference`), `confidence` (`unknown`, `low`, `medium`, `high`), `originalRefs` (≤ 8, `document:`, `transcript:` or `media:` ids) | `manual`, "Written in Emma", "Not recorded", the vault's `updated` |
| `consent` | object: `status` (`unknown`, `granted`, `withdrawn`; `granted` needs a `by`), `by` (≤ 200), `note` (≤ 2,000), `recordedAt` | `unknown`, empty, empty, the vault's `updated` |
| `people`, `tags` | arrays of up to 100 strings of up to 200 characters; blanks and repeats dropped | `[]` |
| `attachments` | at most 8; each `{name (1–250), type, data}`; `type` must be one of `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `audio/wav`, `audio/x-wav`, `audio/mpeg`, `audio/ogg`, `audio/webm`, `video/mp4`; `data` is canonical padded base64 of 1 byte to 5 MiB | `[]` |
| any other field | kept in the plain copy, not shown | |

Memories with `trashedAt` set are shown in their own collapsed section,
"Removed by the owner". Trash is kept, not erased.

The normalized payload must also fit 20 MiB when serialized, as in `vault.js`.

### Identity documents extension `emma-identity-documents/1`

`content.identityDocuments` is `{schema, documents}`; `documents` maps ids
(`[A-Za-z0-9][A-Za-z0-9._-]*`, at most 128) to `{id, kind, name, versions}`.
`kind` is one of `portrait`, `profile`, `horizon`, `reflection`, `soul`,
`other`. At most 32 documents; at most 32 versions each; versions have unique
ids and strictly increasing `number`s; each version carries `originalText` (at
most 64 KiB UTF-8, well-formed Unicode), `scope` (`{mode: private|public}` or
`{mode: project, projectId}`), `provenance` (`reference`, `creator`,
`originalName`, `capturedAt`), `review` (`by`, `at`) and `createdAt`, all
timestamps being exact ISO 8601 UTC strings with milliseconds. A `horizon`
version may carry `horizonEndorsements`: 1–32 events `{id, versionId, status,
by, at}` alternating `endorsed`/`revoked`, in time order, never earlier than the
version. A `soul` document's `originalName` must be `SOUL.md` (any case). The
whole extension is at most 1 MiB. Any other extension version is refused.

The viewer shows every document read-only: the latest version in full, older
versions collapsed, text exactly as written.

## 6. Native payloads: `emma-local-vault/3`, `/4` and `/5` with `content.nativeMemory`

Written by the emma iPhone and Mac app ("Save a backup"). The real record is
`content.nativeMemory.archive`. Everything else in the root is a **mirror** the
exporter generates so that the web app can also open the file. The viewer
renders only from the archive, and checks that the mirror is exactly what the
exporter would have generated from that archive. If the mirror differs in any
way, the viewer refuses the file, because it cannot tell which of the two the
owner meant. (The native app applies the same rule.)

Root rules: exactly the eight members `schema`, `version`, `id`, `name`,
`created`, `updated`, `content`, `recovery`; `id` is a lowercase canonical
UUID; `name` is 1–200 UTF-16 code units and not only whitespace; `created` and
`updated` are exact ISO 8601 UTC with milliseconds; `content.nativeMemory` has
exactly `schema` and `archive`. Payload bounds: `/3` and `/4` at most 131,072
bytes; `/5` at most 4,194,304 bytes.

| Root `schema` / `version` | `nativeMemory.schema` | Archive `version` |
| --- | --- | --- |
| `emma-local-vault/3` / `3.0` | `emma-native-memory/1` | 1 or 2 |
| `emma-local-vault/3` / `3.0` | `emma-native-memory/2` | 3 |
| `emma-local-vault/4` / `4.0` | `emma-native-memory/3` | 4 |
| `emma-local-vault/5` / `5.0` | `emma-native-memory/4` | 6 |

Archive version 5 (kept voice recordings) is never accepted in a memory vault.
A `/4` or `/5` payload without `content.nativeMemory` is refused.

### The archive

`{version, memories, people?, voiceAttachments?}`:

- Versions 1–3: no `people`, no `voiceAttachments`. Version 4: `people`
  present. Version 6: `people` and `voiceAttachments` present, and
  `voiceAttachments` must be empty.
- Versions 1–4 hold at most 12 memories and never an `attribution`; version 2
  is the first that may carry `metadata`; version 3 the first that may carry
  `temporal`. Version 6 holds at most 500 memories.
- Canonical size: at most 32,768 bytes for versions 1–4 and 1 MiB for version 6
  (measured on the sorted-keys serialization, which may differ from Swift's by
  a few bytes).

Each memory row has exactly these possible members:

| Member | Rule |
| --- | --- |
| `id` | lowercase canonical UUID, unique in the archive |
| `text` | 1–600 UTF-8 bytes, not only whitespace; only tab, newline, carriage return and characters from U+0020 up, excluding U+007F–U+009F |
| `createdAt` | JSON number: seconds since 2001-01-01T00:00:00Z (section 7); the save time |
| `sourceRequestID`, `sourceOrigin` | both or neither; lowercase UUID and an origin (`https://host[:port]`, or `http://` only for localhost), no path, no trailing slash |
| `metadata` | `{perspective, voice, eventDate?}`; `perspective` ∈ unspecified, past, present, future; `voice` ∈ unspecified, ownerWords, assisted, other; `eventDate` a valid `YYYY-MM-DD` |
| `temporal` | time-aware record metadata; structure checked (section 6.1); shown only as its `kind` |
| `attribution` | `{kind: "relative", personID}`; requires `voice` = `other`; `null` is refused |

Each person: `{id, name, relationship?, memoryIDs}`; `id` lowercase UUID; `name`
and `relationship` 1–200 UTF-8 bytes with no control characters and at least
one visible character; `memoryIDs` sorted, unique, each present in the archive.
People are sorted by `id`, unique, at most 64.

### 6.1 Temporal metadata

`{kind, parents, target?, recollectedAt?, applicability?, purpose?, validFrom?,
validThrough?, claimedOwnerAction?}` with `kind` ∈ source, perspective,
correction, withdrawal; references are `{id, sha256}` (lowercase UUID, 64 hex);
`parents` has at most 12 references sorted by id. A `source` has no target,
applicability, purpose, validity or action. A `perspective` or `correction`
has a target that is one of its parents, an applicability and a purpose, and
any action is `endorse`. A `withdrawal` has a target among its parents, no
applicability, purpose, validity or `recollectedAt`, and a `withdraw` action.
The viewer checks this structure. It does **not** recompute the SHA-256
digests in references or walk the graph; it labels the memory
"Time-aware record: <kind>" and otherwise shows the words as recorded.

### 6.2 The mirror the exporter generates

For each archive row, `created` = `updated` = `source.capturedAt` =
`consent.recordedAt` = the row's `createdAt` as ISO 8601 UTC with milliseconds;
`title` is "Future possibility" when `perspective` is `future`, else "Emma
memory"; `content` is the text; `trashedAt` is `null`; `source.kind` is
`import` when the row has a source request, else `manual`; `source.reference`
is `<sourceOrigin>/v1/requests/<sourceRequestID>` or "Saved in Emma";
`source.creator` is `relative:<personID>` when attributed, else "Not
recorded"; `consent` is `{status: "unknown", by: "", note: "Local memory
backup; importing grants no agent access."}`; `people` lists the ids of people
whose `memoryIDs` contain the row (in archive order); `tags` is
`["Aspiration, not prediction"]` for `future`, else `[]`; `attachments` is
`[]`. `content.people` maps each person id to the person record (relationship
omitted when absent). `media`, `relationships`, `settings` are `{}`.
`recovery` is `{warnings: [], legacy: null}`. The root `schema`/`version` and
`nativeMemory.schema` follow the table above. The comparison is on the
sorted-keys JSON serialization of the whole root.

The mirror's title, source and consent are **generated text**, never the
owner's words, and the viewer does not show them.

## 7. Legacy EMMA/1.0 payload

`{version?, name?, metadata?, content: {memories: {...}, media?}}`. Each
memory has `content` as a string, or an object with a `text` string; anything
else refuses the file (as `vault.js` refuses it). Title from `metadata.title`,
then `title`, then the first 80 characters, then "Recovered memory";
`metadata.people` and `metadata.tags` string arrays; `created` shown when it
parses as a date, otherwise "not recorded". Source is shown as "legacy · Legacy
memory <id> · Not recorded" and consent as "unknown · Consent not established
by the legacy file", the words `vault.js` records on import. An empty text with
attachments is shown as a viewer note, not as the owner's words.

## 8. Dates

| Where | Encoding | Example | Shown as |
| --- | --- | --- | --- |
| Native archive `createdAt`, `temporal.recollectedAt`, `claimedOwnerAction.at` | JSON number, seconds since 2001-01-01T00:00:00Z, as Swift's `JSONEncoder` writes a `Date` by default; may have a fraction | `760000000.5` | ISO 8601 UTC, rounded to milliseconds: `2025-01-31T07:06:40.500Z` |
| Native mirror and native root `created`/`updated` | ISO 8601 UTC with exactly three fractional digits | `2026-10-01T08:00:00.000Z` | as is |
| Web vault timestamps | any string `Date.parse` accepts, ≤ 40 characters | `2026-03-01T09:05:00.000Z` | normalized to ISO 8601 UTC |
| `metadata.eventDate` (native), `source.documentDate` (web) | calendar strings as the owner typed them; never a time or a time zone | `2020-02-29`, `2019-05` | exactly as recorded, after "About" |
| Helpers request context | Unix seconds since 1970 | | never written to a file; not part of this format |

On screen the viewer writes dates in words, in UTC ("31 January 2025 at 07:06
UTC"). The plain copy `memories.md` keeps the ISO strings.

## 9. Labels shown on a memory

| Recorded | Label |
| --- | --- |
| `perspective` past / present / future | Then / Now / Someday, and "Aspiration, not prediction" on Someday |
| `voice` ownerWords, or no voice | no label: the owner's own words |
| `voice` assisted | agent-assisted |
| `attribution` to a person in People | Written by <name> |
| `attribution` to a person no longer in People | Written by family |
| `voice` other, no attribution | Another person's words |
| `temporal` present | Time-aware record: <kind> |

Web memories carry no perspective or voice; their source and consent are shown
as recorded, including "unknown".

## 10. What is refused, and the four sentences

| File | Where it stops | Sentence |
| --- | --- | --- |
| Not `EMMA`, version bytes other than `01 00`/`02 00`, iteration count other than 600000, shorter than 66 (70 for 2.0) bytes, longer than 20 MiB + 70, or any legacy-mode (heirloom) file, which is JSON text | header check, before the passphrase | This is not a file this viewer can open. |
| The computer could not read the chosen file | reading from disk | The file could not be read from this computer. |
| Wrong passphrase; a flipped, truncated or appended byte anywhere | authentication | Cannot unlock: wrong passphrase or damaged file. |
| Not UTF-8, not JSON, duplicate keys, unknown or unsupported schema (device backups `emma-device-local-backup/*`, experience capsules `emma-native-experience/*`, reviewed records `emma-native-reviewed-record/*`, `emma-local-vault/4` or `/5` without a native archive, any future schema), a mirror that does not match the archive, any bound in sections 5–7 exceeded | payload rules | The file unlocked, but its contents are not in a form this viewer understands, so nothing is shown. |

When a file is refused, nothing from it is shown: no partial list, no raw dump,
no excerpt in the message.

## 11. What the viewer never does

It never writes, re-encrypts or upgrades a file; never connects to a network;
never stores anything (no cookies, local storage, caches or history of its
own); never reads the clipboard; never reads text aloud. Attachments are shown
only through `blob:` URLs created in memory and revoked when the file is
closed. A plain copy is written only when the reader asks for one, as two
ordinary downloads: `vault.json` (the decrypted payload, byte for byte) and
`memories.md` (the reading in this document's words).

## 12. Known differences from emma's own readers

- Nesting: the web reader allows 51 containers, the native reader 50. The
  viewer applies each to its own kind of payload.
- Native archive size bounds are measured on the viewer's sorted-keys
  serialization, which can differ from Swift's by a few bytes.
- Temporal digests and graph links are not verified (section 6.1).
- Native `createdAt` fractions beyond milliseconds are rounded for display;
  the plain copy keeps the number.

## 13. Test vectors

`fixtures/vectors/manifest.json` lists every vector with its passphrase,
expected outcome, SHA-256 of the file, of the decrypted plaintext and of the
derived key, and for openable files the SHA-256 of the canonical reading
(`fixtures/readings/<name>.md`, the `memories.md` the viewer produces). All
vectors are invented: fictional names, fictional stories, generated pictures
and sounds, and salts and nonces derived from the vector's name so that
`node tools/make-fixtures.mjs --check` reproduces them byte for byte. Real
.emma writers draw fresh random salts and nonces for every file.

Native-shaped vectors were made by the Node generator from the rules in
section 6 and checked on 2026-10-29 against emma's own Swift reader
(`EmmaOfflineReader`), which accepted each of them and returned the archive
byte for byte, and refused every negative native vector. Vectors produced by
the Swift code itself are planned for 0.2.
