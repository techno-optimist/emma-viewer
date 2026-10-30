"""Round-trips every committed vector through the Python test reader.

    python3 -m venv .venv && .venv/bin/pip install cryptography
    .venv/bin/python -I python/test_vectors.py -v
"""
import hashlib
import json
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import emma_reader  # noqa: E402

VECTORS = HERE.parent / 'fixtures' / 'vectors'
MANIFEST = json.loads((VECTORS / 'manifest.json').read_text(encoding='utf-8'))


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class VectorTests(unittest.TestCase):
    def test_manifest_is_fictional_and_complete(self):
        self.assertTrue(MANIFEST['fixture'])
        self.assertEqual(MANIFEST['license'], 'CC0-1.0')
        self.assertGreaterEqual(len(MANIFEST['vectors']), 40)

    def test_oversize_file_is_refused_by_the_header(self):
        data = bytearray(20 * 1024 * 1024 + 71)
        data[:10] = b'EMMA\x02\x00\x00\x09\x27\xc0'
        with self.assertRaises(emma_reader.HeaderRefused):
            emma_reader.header(bytes(data))


def make_test(vector):
    def test(self):
        data = (VECTORS / vector['file']).read_bytes()
        self.assertEqual(sha256(data), vector['sha256']['file'])
        expect = vector['expect']
        if expect == 'notEmma':
            with self.assertRaises(emma_reader.HeaderRefused):
                emma_reader.header(data)
            return
        if expect == 'cannotUnlock':
            with self.assertRaises(emma_reader.UnlockRefused):
                emma_reader.unlock(data, vector['passphrase'])
            return
        plaintext, key, _ = emma_reader.unlock(data, vector['passphrase'])
        self.assertEqual(sha256(plaintext), vector['sha256']['plaintext'])
        self.assertEqual(sha256(key), vector['sha256']['derivedKey'])
        if expect == 'unsupported':
            with self.assertRaises(emma_reader.PayloadRefused):
                emma_reader.read(data, vector['passphrase'])
            return
        summary = emma_reader.read(data, vector['passphrase'])
        self.assertEqual(summary['kind'], vector['kind'])
        self.assertEqual(summary['schema'], vector['payloadSchema'])
        counts = vector['counts']
        self.assertEqual(summary['memories'], counts['memories'])
        self.assertEqual(summary['removed'], counts['removed'])
        self.assertEqual(summary['people'], counts['people'])
        self.assertEqual(summary['identityDocuments'], counts['identityDocuments'])
    return test


for _vector in MANIFEST['vectors']:
    _name = 'test_' + _vector['file'].replace('.emma', '').replace('-', '_') + '_' + _vector['expect']
    setattr(VectorTests, _name, make_test(_vector))

if __name__ == '__main__':
    unittest.main()
