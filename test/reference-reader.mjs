// An independently written EMMA/2.0 and EMMA/1.0 opener using node:crypto,
// written from SPEC.md rather than from the viewer. The golden test uses it to
// check that the viewer and a second implementation agree on every vector.
import { pbkdf2Sync, createDecipheriv } from 'node:crypto';

export class RefusedHeader extends Error {}
export class RefusedUnlock extends Error {}

export function header(file) {
  if (file.length < 66 || file.length > 20 * 1024 * 1024 + 70) throw new RefusedHeader('size');
  if (file.subarray(0, 4).toString('latin1') !== 'EMMA') throw new RefusedHeader('magic');
  if (file[5] !== 0) throw new RefusedHeader('minor');
  if (file[4] === 1) return { version: 1, iterations: 100000, salt: file.subarray(6, 38), nonce: file.subarray(38, 50), body: file.subarray(50), aad: null };
  if (file[4] !== 2 || file.length < 70) throw new RefusedHeader('version');
  const iterations = file.readUInt32BE(6);
  if (iterations !== 600000) throw new RefusedHeader('iterations');
  return { version: 2, iterations, salt: file.subarray(10, 42), nonce: file.subarray(42, 54), body: file.subarray(54), aad: file.subarray(0, 54) };
}

export function derive(passphrase, salt, iterations) {
  return pbkdf2Sync(Buffer.from(passphrase, 'utf8'), salt, iterations, 32, 'sha256');
}

export function open(file, passphrase) {
  const h = header(file);
  const key = derive(passphrase, h.salt, h.iterations);
  const decipher = createDecipheriv('aes-256-gcm', key, h.nonce, { authTagLength: 16 });
  if (h.aad) decipher.setAAD(h.aad);
  decipher.setAuthTag(h.body.subarray(h.body.length - 16));
  try {
    const plaintext = Buffer.concat([decipher.update(h.body.subarray(0, h.body.length - 16)), decipher.final()]);
    return { plaintext, key, version: h.version };
  } catch (error) { throw new RefusedUnlock('tag'); }
}
