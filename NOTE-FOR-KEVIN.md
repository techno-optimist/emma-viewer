# Note for Kevin: emma viewer 0.1

Short version: the viewer works offline from one file, every test passes, and
the repository is public at https://github.com/techno-optimist/emma-viewer.

## Try it

Double-click `emma-viewer.html` in this folder. Choose
`fixtures/vectors/web-v3.emma`. Type `lantern-notebook-fixture`. Everything in
that file is invented.

## What you need to decide

1. **Public repo.** Done on 2026-10-29 with your yes: the code is public at
   https://github.com/techno-optimist/emma-viewer (Apache-2.0 code, CC0 spec
   and fixtures).
2. **Answers the design panel recommended, still unconfirmed by you:**
   unknown formats are refused with no raw dump (built that way); voice
   recordings are never in a `.emma` file and the README says so (built that
   way); legacy mode's cipher switches from ChaCha20-Poly1305 to AES-256-GCM
   so this viewer can open heirloom files in 0.2 (a change in the emma app, not
   here).

## Left for 0.2

- Heirloom (legacy-mode) files, after the cipher switch in the app: code word
  plus the eight-word passphrase, rules shown first, remembrances read-only.
  The EFF word list is already credited in `NOTICE` for that.
- Native fixtures produced by the Swift code itself. The ones here were made by
  the Node generator and checked against the Swift reader, which accepted all
  four byte for byte. The proposal for a small Swift test target that writes
  fixtures plus SHA-256 of file, plaintext and derived key into this repo is in
  `docs/native-fixtures-proposal.md`. It does not touch the emma checkout
  until you approve it.
- Hosting the same bytes at `www.honesty.tools/emma` and on GitHub Pages.
- Archive deposits at Software Heritage and the Internet Archive.
- The independent reviewer, before anyone is told to rely on this.

## Test counts on 2026-10-29

- `node --test test/`: 104 checks, all passing (53 golden and gate checks over
  the 41 vectors, 8 open and 33 refused; 51 headless Chromium checks: every
  vector from `file://`, the 8 openable ones also from a local web server, with
  zero requests and two exact downloads each).
- Python reader: 43 checks, all passing.
- Swift oracle (`tools/oracle-check.mjs`): 12 checks, all passing: 4 native
  vectors accepted byte for byte, 7 negatives and a wrong passphrase refused.

Nothing real is in this folder: no vault, passphrase, code word, fingerprint,
vault ID, name, photo or audio.
