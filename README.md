# emma viewer

A reader for `.emma` files that works with nothing but the file, the
passphrase, and a web browser. One HTML file. No installation, no account, no
internet, no company that has to still exist.

emma is a private memory app. Its owners keep their memories in an encrypted
`.emma` file. This viewer exists so that a family can read such a file if the
app, or the people who made it, are ever gone.

## Open a file

1. Download `emma-viewer.html` and keep it next to the `.emma` file.
2. Double-click `emma-viewer.html`. It opens in your browser.
3. Click **Choose a .emma file** and pick the file.
4. Type the passphrase. Spaces, capitals and accents count exactly.
5. Click **Unlock**. Turning the passphrase into a key takes a few seconds on
   purpose.

Try it first with a fixture: choose `fixtures/vectors/web-v3.emma` and type
`lantern-notebook-fixture`. Everything in that file is invented.

The viewer shows one memory per card with the exact words as recorded, the
date it was saved, the date it is about when the owner noted one, labels such
as Then / Now / Someday and who wrote it, the source and consent as recorded,
people, tags, and pictures, sound and video that were attached. Memories the
owner moved to Trash are in a collapsed section, "Removed by the owner". Text
documents the owner kept are shown read-only.

**Save a plain copy** writes two unencrypted files, `vault.json` (the complete
decrypted contents, byte for byte) and `memories.md` (the memories in plain
text). Keep them as carefully as the passphrase.

## What this is and is not

- **Opening a file does not make you the owner or the heir.** The viewer shows
  what a file holds. Who may read it, keep it or pass it on is a question
  between people, not something a file or a program decides.
- **The words may include other people's private information.** A memory about
  a friend is also the friend's. Please treat what you read with that care.
- **Nobody can recover a lost passphrase, card or key.** Not the people who made
  emma, not the people who made this viewer, not anyone. The viewer does not
  weaken the encryption and cannot be made to.
- **The owner's rules shown by the viewer are wishes, not locks.** A file may
  carry notes about who should read what, or an identity document called
  "Legacy wishes". The viewer shows them. It cannot enforce them, and neither
  can anyone else once the file and passphrase are in hand.
- **Recordings are not in any `.emma` file.** emma keeps voice recordings
  separately on the owner's device. A memory that had a recording shows only
  its written words here. Nothing in this viewer can find or play the
  recording.
- **A fork must not present itself as emma or honesty.tools.** You may copy,
  change and share this viewer under its licence. If you change it, give it
  another name and remove the emma and honesty.tools names, so nobody trusts
  your copy because of them.
- **Check the file you downloaded.** `SHA256SUMS` lists the SHA-256 of
  `emma-viewer.html` and `SPEC.md`. On a Mac, run `shasum -a 256 -c SHA256SUMS`
  in the folder. Archived copies are planned at Software Heritage and the
  Internet Archive, and at `www.honesty.tools/emma` and GitHub Pages, serving
  the same bytes; this version is not yet published anywhere.

## What it opens, and what it refuses

It opens EMMA/2.0 files written by the emma web app and by the emma iPhone and
Mac app (payloads `emma-local-vault/2`, `/3`, `/4`, `/5`), and the 2025
prototype's EMMA/1.0 files read-only with a warning. Everything else is
refused with one plain sentence and nothing is shown: device backups,
experience capsules, reviewed records, legacy-mode (heirloom) files, unknown
versions. `SPEC.md` describes all of it in byte tables. There are exactly four
possible error sentences, and none of them ever contains anything from the
file.

## How it stays offline

The page's Content Security Policy is `default-src 'none'` with hashed inline
script and style. It never uses the network, storage, cookies, the clipboard
or read-aloud voices. Attachments are shown through in-memory `blob:` URLs. A
headless-browser test opens every fixture from `file://` and from a web server
and fails if the page makes a single request.

## For developers

Nothing to build. Open `emma-viewer.html`. To run the tests:

```bash
npm install && npm test
```

`node --test test/golden.test.mjs test/gate.test.mjs` needs no dependencies.
The browser test needs Playwright (dev dependency only). The Python reader
needs `cryptography`: `python3 -m venv .venv && .venv/bin/pip install
cryptography && .venv/bin/python -I python/test_vectors.py`.

- `tools/make-fixtures.mjs` regenerates the CC0 test vectors deterministically.
- `tools/record-readings.mjs` records the canonical reading of each vector.
- `tools/csp-hash.mjs --write` and `tools/sha256sums.mjs --write` refresh the
  CSP hashes and `SHA256SUMS` after editing the viewer or the spec.

Licence: Apache-2.0 for the code (`LICENSE`), CC0 1.0 for `SPEC.md` and the
fixtures (`fixtures/LICENSE`). See `RIGHTS-INVENTORY.md`, `SECURITY.md` and
`CHANGELOG.md`.
