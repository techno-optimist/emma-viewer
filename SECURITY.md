# Security

## What this viewer protects, and what it cannot

emma viewer opens one `.emma` file at a time, on the reader's own computer,
with a passphrase the reader already has. It never sends anything anywhere:
the page's Content Security Policy is `default-src 'none'`, the only scripts
and styles are the hashed inline ones, and the headless-browser test counts
every request the page makes while a file is opened and requires zero.

It cannot protect against:

- a wrong or weak passphrase. Anyone holding a copy of a file can try
  passphrases offline, as slowly as 600,000 PBKDF2 rounds allow; no server can
  stop that.
- a compromised computer: a malicious browser extension, another process that
  reads memory, a keylogger, or a modified copy of the viewer. Check the
  viewer's SHA-256 against `SHA256SUMS` before trusting a copy.
- a plain copy left lying around. "Save a plain copy" writes `vault.json` and
  `memories.md` unencrypted. They need the same care as the passphrase.
- the words inside. A file may hold other people's private information.
  Opening it does not change who is allowed to know it.

AES-GCM detects any change to a file, but a valid tag does not prove who wrote
the file, when, or with whose consent. Consent and attribution fields are
recorded assertions, not signatures.

## Reporting a problem

Open a GitHub issue in this repository with the word "security" in the title,
or write to the maintainer address in the repository profile. Please do not
attach a real `.emma` file or a real passphrase; describe the problem with a
generated fixture (`node tools/make-fixtures.mjs`).

## Review record

- 2026-10-29: viewer written; 41 vectors (8 openable, 33 refused) pass in the
  Node core, in Chromium from `file://` and from a local http server, in an
  independent `node:crypto` reader and in a Python `cryptography` reader (104
  Node checks, 43 Python checks); the Node-made native vectors were accepted
  byte for byte by emma's own Swift reader (12 oracle checks). No independent
  human review yet. That review is required before the
  repository is made public (see the owner's requirement, recorded in emma's
  design record of 2026-10-24).
