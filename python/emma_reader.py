"""Test-only reader for .emma files, written from SPEC.md.

It exists to cross-check the viewer's test vectors from a second language and
a second crypto library. It is not a product and shows nothing to a person.
Requires the `cryptography` package. Python 3.9 or later.
"""
import json
import struct
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITERATIONS = 600000
MAX_FILE = 20 * 1024 * 1024 + 70
MEDIA_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/wav', 'audio/x-wav',
               'audio/mpeg', 'audio/ogg', 'audio/webm', 'video/mp4'}
UNSAFE_KEYS = {'__proto__', 'constructor', 'prototype'}
REFERENCE = datetime(2001, 1, 1, tzinfo=timezone.utc)


class HeaderRefused(Exception):
    """Not an EMMA/1.0 or EMMA/2.0 file; refused before any key derivation."""


class UnlockRefused(Exception):
    """Authentication failed: wrong passphrase or changed bytes."""


class PayloadRefused(Exception):
    """Authenticated, decrypted, then refused by the payload rules."""


@dataclass
class Header:
    version: int
    iterations: int
    salt: bytes
    nonce: bytes
    body: bytes
    aad: bytes


def header(data: bytes) -> Header:
    if not 66 <= len(data) <= MAX_FILE or data[:4] != b'EMMA' or data[5] != 0:
        raise HeaderRefused()
    if data[4] == 1:
        return Header(1, 100000, data[6:38], data[38:50], data[50:], b'')
    if data[4] != 2 or len(data) < 70:
        raise HeaderRefused()
    iterations = struct.unpack('>I', data[6:10])[0]
    if iterations != ITERATIONS:
        raise HeaderRefused()
    return Header(2, iterations, data[10:42], data[42:54], data[54:], data[:54])


def derive_key(passphrase: str, salt: bytes, iterations: int) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations)
    return kdf.derive(passphrase.encode('utf-8'))


def unlock(data: bytes, passphrase: str):
    """Returns (plaintext, key, header) or raises HeaderRefused / UnlockRefused."""
    h = header(data)
    if not 1 <= len(passphrase.encode('utf-16-le')) // 2 <= 1024:
        raise UnlockRefused()
    key = derive_key(passphrase, h.salt, h.iterations)
    try:
        plaintext = AESGCM(key).decrypt(h.nonce, h.body, h.aad or None)
    except Exception as error:  # noqa: BLE001 - one sentence for every failure
        raise UnlockRefused() from None
    return plaintext, key, h


def _strict_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result or key in UNSAFE_KEYS:
            raise PayloadRefused()
        result[key] = value
    return result


def _refuse_constant(_):
    raise PayloadRefused()


def _depth(value, level=1):
    if isinstance(value, dict):
        return max([level] + [_depth(v, level + 1) for v in value.values()])
    if isinstance(value, list):
        return max([level] + [_depth(v, level + 1) for v in value])
    return level


def parse_payload(plaintext: bytes):
    try:
        text = plaintext.decode('utf-8', errors='strict')
        root = json.loads(text, object_pairs_hook=_strict_pairs, parse_constant=_refuse_constant)
    except PayloadRefused:
        raise
    except Exception:
        raise PayloadRefused() from None
    if not isinstance(root, dict):
        raise PayloadRefused()
    return root


def iso(reference_seconds) -> str:
    moment = REFERENCE + timedelta(seconds=reference_seconds)
    return moment.strftime('%Y-%m-%dT%H:%M:%S.') + f'{moment.microsecond // 1000:03d}Z'


def canonical(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def native_projection(archive, root):
    version = archive['version']
    people = {p['id']: p for p in archive.get('people', [])}
    memories = {}
    for row in archive['memories']:
        stamp = iso(row['createdAt'])
        future = row.get('metadata', {}).get('perspective') == 'future'
        attributed = row.get('attribution')
        memories[row['id']] = {
            'id': row['id'], 'title': 'Future possibility' if future else 'Emma memory', 'content': row['text'],
            'created': stamp, 'updated': stamp, 'trashedAt': None,
            'source': {'kind': 'import' if 'sourceRequestID' in row else 'manual',
                       'reference': f"{row['sourceOrigin']}/v1/requests/{row['sourceRequestID']}" if 'sourceOrigin' in row else 'Saved in Emma',
                       'creator': f"relative:{attributed['personID']}" if attributed else 'Not recorded', 'capturedAt': stamp},
            'consent': {'status': 'unknown', 'by': '', 'note': 'Local memory backup; importing grants no agent access.', 'recordedAt': stamp},
            'people': [p['id'] for p in archive.get('people', []) if row['id'] in p['memoryIDs']],
            'tags': ['Aspiration, not prediction'] if future else [], 'attachments': []}
    schema = {6: ('emma-local-vault/5', '5.0', 'emma-native-memory/4'), 4: ('emma-local-vault/4', '4.0', 'emma-native-memory/3'),
              3: ('emma-local-vault/3', '3.0', 'emma-native-memory/2')}.get(version, ('emma-local-vault/3', '3.0', 'emma-native-memory/1'))
    return {'schema': schema[0], 'version': schema[1], 'id': root['id'], 'name': root['name'], 'created': root['created'], 'updated': root['updated'],
            'content': {'memories': memories, 'people': people, 'media': {}, 'relationships': {}, 'settings': {},
                        'nativeMemory': {'schema': schema[2], 'archive': archive}},
            'recovery': {'warnings': [], 'legacy': None}}


def read(data: bytes, passphrase: str) -> dict:
    """Opens a file and returns a summary: kind, schema and counts. Refuses like the viewer."""
    plaintext, key, h = unlock(data, passphrase)
    root = parse_payload(plaintext)
    if _depth(root) > 51:
        raise PayloadRefused()
    content = root.get('content')
    if h.version == 1:
        memories = content.get('memories') if isinstance(content, dict) else None
        if not isinstance(memories, dict):
            raise PayloadRefused()
        people = set()
        for memory in memories.values():
            text = memory.get('content') if isinstance(memory, dict) else None
            if isinstance(text, dict):
                text = text.get('text')
            if not isinstance(text, str):
                raise PayloadRefused()
            people.update(p for p in (memory.get('metadata') or {}).get('people', []) if isinstance(p, str))
        return {'kind': 'legacy', 'schema': 'EMMA/1.0 legacy', 'memories': len(memories), 'removed': 0, 'people': len(people), 'identityDocuments': 0}
    schema = root.get('schema')
    if isinstance(content, dict) and 'nativeMemory' in content:
        if _depth(root) > 50 or len(plaintext) > (4194304 if schema == 'emma-local-vault/5' else 131072):
            raise PayloadRefused()
        archive = content['nativeMemory'].get('archive') if isinstance(content['nativeMemory'], dict) else None
        if not isinstance(archive, dict) or archive.get('version') not in (1, 2, 3, 4, 6):
            raise PayloadRefused()
        if archive['version'] == 6 and archive.get('voiceAttachments') != []:
            raise PayloadRefused()
        if canonical(root) != canonical(native_projection(archive, root)):
            raise PayloadRefused()
        return {'kind': 'native', 'schema': schema, 'memories': len(archive['memories']), 'removed': 0,
                'people': len(archive.get('people', [])), 'identityDocuments': 0}
    if (schema, root.get('version')) not in (('emma-local-vault/3', '3.0'), ('emma-local-vault/2', '2.0')):
        raise PayloadRefused()
    memories = content.get('memories') if isinstance(content, dict) else None
    if not isinstance(memories, dict) or len(memories) > 2000:
        raise PayloadRefused()
    removed, people = 0, set()
    for key_, memory in memories.items():
        if not isinstance(memory, dict) or memory.get('id') != key_ or len(memory.get('content', '')) > 200000:
            raise PayloadRefused()
        attachments = memory.get('attachments', [])
        if len(attachments) > 8 or any(a.get('type') not in MEDIA_TYPES for a in attachments):
            raise PayloadRefused()
        if memory.get('trashedAt'):
            removed += 1
        else:
            people.update(p for p in memory.get('people', []) if isinstance(p, str) and p)
    documents = content.get('identityDocuments')
    if documents is not None and documents.get('schema') != 'emma-identity-documents/1':
        raise PayloadRefused()
    return {'kind': 'web', 'schema': schema, 'memories': len(memories) - removed, 'removed': removed, 'people': len(people),
            'identityDocuments': len(documents['documents']) if documents else 0}


