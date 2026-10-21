import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cargoPackages,
  npmPackages,
  sha256,
  snapshotFingerprint,
  verifyNotices,
} from './third-party-notices.mjs';

test('notice coverage includes duplicate Cargo versions and only registry/git dependencies', () => {
  const lock = `version = 4
[[package]]
name = "repo-creator"
version = "1.3.2"
[[package]]
name = "same-name"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
[[package]]
name = "same-name"
version = "2.0.0"
source = "git+https://example.invalid/source#revision"
`;
  assert.deepEqual(cargoPackages(lock), [
    { name: 'same-name', version: '1.0.0' },
    { name: 'same-name', version: '2.0.0' },
  ]);
});

test('npm notice coverage retains production transitive/scoped packages and excludes build tooling', () => {
  const packages = npmPackages({
    packages: {
      '': { name: 'application', version: '1' },
      'node_modules/@scope/runtime': { version: '2', license: 'MIT' },
      'node_modules/parent/node_modules/transitive': { version: '3', license: 'BSD-3-Clause' },
      'node_modules/build-tool': { version: '4', dev: true, license: 'MIT' },
    },
  });
  assert.deepEqual(
    packages.map(({ name, version }) => ({ name, version })),
    [
      { name: '@scope/runtime', version: '2' },
      { name: 'transitive', version: '3' },
    ],
  );
});

test('dependency fingerprints ignore checkout line endings and detect dependency/provenance edits', () => {
  const base = [['Cargo.lock', 'one\ntwo\n']];
  assert.equal(snapshotFingerprint(base), snapshotFingerprint([['Cargo.lock', 'one\r\ntwo\r\n']]));
  assert.notEqual(
    snapshotFingerprint(base),
    snapshotFingerprint([['Cargo.lock', 'one\nchanged\n']]),
  );
  assert.notEqual(snapshotFingerprint(base), snapshotFingerprint([['another-file', 'one\ntwo\n']]));
});

const fingerprint = 'a'.repeat(64);
const licenseId = 'b'.repeat(64);
const body = `NPM package: runtime@1.0.0
License text: ${licenseId} (LICENSE)
Feather icons
SPDX License List Data v3.29.0
LICENSE TEXT SHA256: ${licenseId}
Original license grant
`;
const document = (
  content = body,
  expectedFingerprint = fingerprint,
) => `Repo Creator - Third-party notices
Dependency snapshot SHA-256: ${expectedFingerprint}
Notice body SHA-256: ${sha256(content)}

--- NOTICE BODY ---
${content}`;

test('offline verification rejects stale snapshots, truncated content and missing package coverage', () => {
  assert.deepEqual(verifyNotices(document(), fingerprint, ['NPM:runtime@1.0.0']), {
    packages: 1,
    licenseTexts: 1,
  });
  assert.throws(() => verifyNotices(document(), 'c'.repeat(64), ['NPM:runtime@1.0.0']), /stale/);
  assert.throws(
    () => verifyNotices(document().slice(0, -1), fingerprint, ['NPM:runtime@1.0.0']),
    /digest/,
  );
  assert.throws(() => verifyNotices(document(), fingerprint, ['NPM:runtime@2.0.0']), /coverage/);
});

test('offline verification rejects missing license texts, removed asset attribution and personal source paths', () => {
  assert.throws(
    () =>
      verifyNotices(
        document(body.replace(`LICENSE TEXT SHA256: ${licenseId}`, 'REMOVED')),
        fingerprint,
        ['NPM:runtime@1.0.0'],
      ),
    /license text/,
  );
  assert.throws(
    () =>
      verifyNotices(document(body.replace('Feather icons', 'Removed')), fingerprint, [
        'NPM:runtime@1.0.0',
      ]),
    /attribution/,
  );
  assert.throws(
    () =>
      verifyNotices(document(`${body}Source cache: /Users/example/.cargo/source\n`), fingerprint, [
        'NPM:runtime@1.0.0',
      ]),
    /Machine-specific/,
  );
});
