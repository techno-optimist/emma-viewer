# Fixtures

Everything here is invented and dedicated to the public domain (CC0 1.0, see
`LICENSE` in this folder). No real vault, person, passphrase, picture or
recording. Names such as "Rowan Fixture" and "Mira Fixture" are placeholders.

- `vectors/manifest.json`: every vector with its passphrase, expected outcome
  (`open`, `notEmma`, `cannotUnlock`, `unsupported`), the SHA-256 of the file,
  of the decrypted plaintext and of the derived key, and for openable files
  the SHA-256 of the canonical reading.
- `vectors/*.emma`: the files. `web-*` are web-app vaults, `native-*` are
  app backups, `legacy-v1` is a 2025-prototype file, `neg-*` must be refused.
- `readings/*.md`: the `memories.md` the viewer produces for each openable
  vector. The golden test pins the viewer to these exactly.

Reproduce: `node tools/make-fixtures.mjs` (or `--check`). Salts and nonces are
derived from each vector's name so the bytes never change. Real `.emma` files
use fresh random values; fixed values are only acceptable for public test data
that protects nothing.

Open one yourself: double-click `emma-viewer.html`, choose
`fixtures/vectors/web-v3.emma`, type `lantern-notebook-fixture`.

The native-shaped vectors were made by the Node generator and checked on
2026-10-29 against emma's Swift reader, which accepted all four and refused the
negative ones. Swift-produced vectors are planned for 0.2.
