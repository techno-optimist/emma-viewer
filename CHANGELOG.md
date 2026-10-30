# Changelog

## 0.1.0 (unreleased, 2026-10-29)

First version of the offline reader.

- Opens EMMA/2.0 files with payloads `emma-local-vault/2` (read as `/3`),
  `/3`, `/4` and `/5`, and legacy EMMA/1.0 files read-only with a warning.
- Native payloads are shown from `content.nativeMemory.archive`; the mirror
  beside it must match the archive exactly or the file is refused.
- Memories one per card: exact text, Saved and About dates, Then / Now /
  Someday, voice and attribution labels, source and consent as recorded,
  people, tags, image/audio/video attachments through `blob:` URLs.
- Trash in a collapsed "Removed by the owner" section; people; identity
  documents read-only.
- "Save a plain copy": `vault.json` (decrypted payload, byte for byte) and
  `memories.md`.
- Everything else is refused with one of four fixed sentences. Duplicate JSON
  keys are refused.
- Lantern look from emma's own kit: amber, paper, cocoa and dusk, a serif
  wordmark when an installed serif is available, three visible steps (choose,
  unlock, read), drag-and-drop, date stamps on cards, a print stylesheet.
  Installed fonts only; nothing is fetched.
- Tests: 41 CC0 vectors with golden readings; headless Chromium with a
  zero-request assertion from `file://` and http; grep gate; CSP hash and
  SHA256SUMS checks; independent Node and Python readers. On 2026-10-29:
  104 Node checks, 43 Python checks and 12 Swift-oracle checks, all passing.

Not in 0.1: legacy-mode (heirloom) files, Swift-produced native vectors,
hosting, archive deposits, independent review. See `NOTE-FOR-KEVIN.md`.
