import { createHash, createPublicKey, verify } from 'node:crypto';

// Tauri's base64-wrapped minisign format. Node's native Ed25519/BLAKE2b primitives
// verify both the package and trusted comment, matching minisign-verify used by Tauri.
// https://docs.rs/minisign-verify/0.3.0/src/minisign_verify/lib.rs.html
const decode = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.trim()))
    throw new Error('Invalid updater signature encoding.');
  const bytes = Buffer.from(value.trim(), 'base64');
  if (bytes.toString('base64') !== value.trim())
    throw new Error('Invalid updater signature encoding.');
  return bytes;
};
export function verifyUpdaterSignature(bytes, signature, publicKey, version) {
  const keyLines = decode(publicKey).toString('utf8').trimEnd().split(/\r?\n/);
  const lines = decode(signature).toString('utf8').trimEnd().split(/\r?\n/);
  if (keyLines.length !== 2 || lines.length !== 4 || !lines[2].startsWith('trusted comment: '))
    throw new Error('Invalid updater signature format.');
  const key = decode(keyLines[1]);
  const signed = decode(lines[1]);
  const global = decode(lines[3]);
  if (
    key.length !== 42 ||
    signed.length !== 74 ||
    global.length !== 64 ||
    !['Ed', 'ED'].includes(key.subarray(0, 2).toString()) ||
    !signed.subarray(2, 10).equals(key.subarray(2, 10))
  )
    throw new Error('Updater signing key mismatch.');
  const algorithm = signed.subarray(0, 2).toString();
  if (!['Ed', 'ED'].includes(algorithm))
    throw new Error('Unsupported updater signature algorithm.');
  const publicObject = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]),
    format: 'der',
    type: 'spki',
  });
  const comment = lines[2].slice('trusted comment: '.length);
  const payload = algorithm === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes;
  if (
    !verify(null, payload, publicObject, signed.subarray(10)) ||
    !verify(null, Buffer.concat([signed.subarray(10), Buffer.from(comment)]), publicObject, global)
  )
    throw new Error('Updater signature verification failed.');
  const versions = comment.split('\t').filter((field) => field.startsWith('version:'));
  if (versions.length !== 1 || versions[0] !== `version:${version}`)
    throw new Error('Updater signed version does not match the release.');
}
