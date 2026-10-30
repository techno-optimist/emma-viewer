# Proposal: Swift-produced native fixtures for emma viewer (0.2)

Status: proposal only. Nothing in the emma checkout has been changed. If
approved, this adds one test file to `native/Tests/EmmaCoreTests/` in the emma
repository. The test is skipped unless an environment variable names the
viewer repository, so `swift test` stays unchanged for everyone else.

## Why

The native vectors in `fixtures/vectors/native-*.emma` were made by the Node
generator from the rules in `SPEC.md` section 6, then checked against
`EmmaOfflineReader`, which accepted them byte for byte. That is strong
evidence, but the gold standard is a file written by `NativeMemoryVault.encrypt`
itself. A Swift-written vector also pins the exact spelling Swift gives to
`createdAt` numbers and ISO timestamps.

## What the test writes

Into `<viewer repo>/fixtures/vectors/swift/`:

- `swift-native-v3.emma`, `swift-native-v4.emma`, `swift-native-v5.emma`,
  `swift-native-v3-temporal.emma`: encrypted with the fixture passphrase
  `lantern-notebook-fixture`, using the real writer, so salt and nonce are
  fresh on every run. The manifest therefore records hashes, and the viewer
  test checks the hashes, not fixed bytes.
- `swift-manifest.json`: for each file, SHA-256 of the file, of the plaintext
  payload (`NativeMemoryVault.payload`) and of the derived key
  (PBKDF2-HMAC-SHA-256, 600,000 rounds, from the file's own salt), plus the
  archive's canonical bytes as base64 so the viewer test can compare its
  reading with the exact Swift record.

All content is fictional and mirrors the Node fixtures' rows, so the readings
should match `fixtures/readings/native-*.md` apart from the vault ID and dates
of the root, which the Swift writer draws itself.

## The test (sketch)

```swift
import XCTest
import CryptoKit
import CommonCrypto
@testable import EmmaCore

/// Writes fictional native fixtures for the open-source viewer.
/// Runs only when EMMA_VIEWER_REPO points at a checkout of emma-viewer.
final class ViewerFixtureTests: XCTestCase {
    private let phrase = "lantern-notebook-fixture"
    private let ids = (0..<8).map { String(format: "00000000-0000-4000-8000-0000000b%04d", $0 + 1) }
    private let people = ["00000000-0000-4000-8000-0000000d0001", "00000000-0000-4000-8000-0000000d0002"]
    private let base = Date(timeIntervalSinceReferenceDate: 760_000_000)

    private func rows(attributed: Bool) throws -> [PreviewMemory] {
        var rows = [
            try PreviewMemory(id: ids[0], text: "Fixture then: the lantern café on the corner, where e\u{301} and é stay distinct.",
                              createdAt: base.addingTimeInterval(0.5), perspective: .past, eventDate: "2020-02-29", voice: .ownerWords),
            try PreviewMemory(id: ids[1], text: "Fixture now: a present observation written with help.",
                              sourceRequestID: "00000000-0000-4000-8000-0000000c0001", sourceOrigin: "https://fixture.example.test",
                              createdAt: base.addingTimeInterval(1), perspective: .present, voice: .assisted),
            try PreviewMemory(id: ids[2], text: "Fixture someday: a hope to visit a moon garden 🪷.",
                              createdAt: base.addingTimeInterval(2.25), perspective: .future, eventDate: "2027-04-12", voice: .other),
            try PreviewMemory(id: ids[3], text: "Unspecified stays unknown.", createdAt: base.addingTimeInterval(3))
        ]
        if attributed {
            rows.append(try PreviewMemory(id: ids[4], text: "Fixture words written by Mira about the harbour.", createdAt: base.addingTimeInterval(4),
                                          perspective: .past, voice: .other, attribution: PreviewMemoryAttribution(relative: people[0])))
            rows.append(try PreviewMemory(id: ids[5], text: "Written by someone no longer in People (fixture).", createdAt: base.addingTimeInterval(5.75),
                                          voice: .other, attribution: PreviewMemoryAttribution(relative: "00000000-0000-4000-8000-0000000d0009")))
        }
        return rows
    }

    private func store(version: Int) throws -> PreviewMemoryStore {
        switch version {
        case 2: return try PreviewMemoryStore(memories: rows(attributed: false))
        case 3:
            let temporal = try TemporalMemoryMetadata(kind: .source, recollectedAt: base.addingTimeInterval(100))
            return try PreviewMemoryStore(memories: [try rows(attributed: false)[0],
                try PreviewMemory(id: ids[6], text: "A recollection recorded later (fixture).", createdAt: base.addingTimeInterval(6), temporal: temporal)])
        case 4, 6:
            var store = try PreviewMemoryStore(memories: rows(attributed: version == 6))
            let linked = version == 6 ? [ids[0], ids[2], ids[4]] : [ids[0], ids[2]]
            try store.upsertPerson(NativePerson(id: people[0], name: "Mira Fixture", relationship: "sister (fictional)", memoryIDs: linked.sorted()))
            try store.upsertPerson(NativePerson(id: people[1], name: "Rowan Fixture"))
            return store
        default: fatalError("unknown fixture version")
        }
    }

    func testWriteViewerFixtures() throws {
        guard let repo = ProcessInfo.processInfo.environment["EMMA_VIEWER_REPO"] else { throw XCTSkip("EMMA_VIEWER_REPO not set") }
        let folder = URL(fileURLWithPath: repo).appendingPathComponent("fixtures/vectors/swift", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var manifest: [[String: String]] = []
        for (name, version) in [("swift-native-v3", 2), ("swift-native-v3-temporal", 3), ("swift-native-v4", 4), ("swift-native-v5", 6)] {
            let archive = try store(version: version)
            let file = try NativeMemoryVault.encrypt(archive, passphrase: phrase)
            let payload = try NativeMemoryVault.payload(archive)   // same canonical bytes as inside `file`
            // Derive the key exactly as the envelope does, from this file's own salt.
            let salt = file.subdata(in: 10..<42)
            var derived = [UInt8](repeating: 0, count: 32)
            let password = Array(phrase.utf8)
            _ = CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), password.map { CChar(bitPattern: $0) }, password.count,
                                     [UInt8](salt), salt.count, CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 600_000, &derived, 32)
            try file.write(to: folder.appendingPathComponent(name + ".emma"))
            manifest.append(["file": name + ".emma", "passphrase": phrase,
                "fileSHA256": SHA256.hash(data: file).map { String(format: "%02x", $0) }.joined(),
                "plaintextSHA256": SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined(),
                "derivedKeySHA256": SHA256.hash(data: Data(derived)).map { String(format: "%02x", $0) }.joined(),
                "archiveCanonicalBase64": try archive.encoded().base64EncodedString()])
            // Round trip through the real reader before anything is published.
            XCTAssertEqual(try NativeMemoryVault.decrypt(file, passphrase: phrase).encoded(), try archive.encoded())
        }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(["fixture": "true"]).write(to: folder.appendingPathComponent(".fixture"))
        try encoder.encode(manifest).write(to: folder.appendingPathComponent("swift-manifest.json"))
    }
}
```

Note: `NativeMemoryVault.payload` is `static func payload(_:)` with internal
access, reachable through `@testable import`, which is why this is a test
target rather than a script. The plaintext inside `encrypt` is produced by the
same call, so the recorded plaintext hash matches the decrypted bytes.

## How the viewer repo would use it

```bash
cd <emma checkout>/native
EMMA_VIEWER_REPO=<viewer repo> swift test --filter ViewerFixtureTests
cd <viewer repo> && node tools/record-readings.mjs && npm test
```

A new golden test reads `swift-manifest.json`, opens each file with the viewer
core, checks the three hashes, and checks that the reading's texts, dates and
labels equal those derived from `archiveCanonicalBase64`.

## Not in this proposal

No change to `NativeMemoryVault`, no new public API, no fixture with a real
memory, and no run in CI until the viewer repository exists.
