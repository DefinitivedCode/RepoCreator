import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  checkVersions,
  checksums,
  collectRelease,
  packagePlatform,
  platformAssets,
  releaseVersion,
} from './release.mjs';

const temporary = [];
const directory = () => {
  const value = mkdtempSync(path.join(os.tmpdir(), 'repo-creator-release-'));
  temporary.push(value);
  return value;
};
function removeOwned(item) {
  const target = path.resolve(item);
  if (!temporary.some((root) => target === root || target.startsWith(root + path.sep)))
    throw new Error('Refusing unexpected test cleanup path.');
  rmSync(target, { recursive: true, force: true });
}
afterEach(() => {
  for (const item of temporary) removeOwned(item);
  temporary.length = 0;
});
function put(root, name, data) {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
}
function manifestFixture() {
  const root = directory();
  put(root, 'package.json', JSON.stringify({ version: '1.3.2' }));
  put(
    root,
    'package-lock.json',
    JSON.stringify({ version: '1.3.2', packages: { '': { version: '1.3.2' } } }),
  );
  put(root, 'src-tauri/tauri.conf.json', JSON.stringify({ version: '1.3.2' }));
  put(
    root,
    'src-tauri/Cargo.toml',
    '[package]\nname = "repo-creator"\nversion = "1.3.2"\n\n[dependencies]\n',
  );
  put(
    root,
    'src-tauri/Cargo.lock',
    'version = 4\n\n[[package]]\nname = "other"\nversion = "2.0.0"\n\n[[package]]\nname = "repo-creator"\nversion = "1.3.2"\n',
  );
  return root;
}
test('release versions and tags are strict and every application manifest must agree', () => {
  const root = manifestFixture();
  assert.equal(checkVersions(root, '1.3.2', 'v1.3.2'), '1.3.2');
  assert.equal(checkVersions(root), '1.3.2');
  assert.equal(releaseVersion('1.5.0-beta.1'), '1.5.0-beta.1');
  for (const invalid of ['1.3', 'v1.3.2', '01.3.2', '1.3.2-beta.01', '1.3.2\n', '../1.3.2'])
    assert.throws(() => releaseVersion(invalid));
  assert.throws(() => checkVersions(root, '1.3.2', 'v1.3.1'));
  put(root, 'src-tauri/Cargo.toml', '[package]\nname = "repo-creator"\nversion = "1.3.1"\n');
  assert.throws(() => checkVersions(root, '1.3.2'), /Cargo.toml/);
});
test('distribution names encode version, architecture and real signing status', () => {
  assert.deepEqual(platformAssets('1.3.2', 'windows', 'x64'), [
    'Repo-Creator-1.3.2-windows-x64-unsigned-setup.exe',
    'Repo-Creator-1.3.2-windows-x64-unsigned.msi',
    'Repo-Creator-1.3.2-windows-x64-unsigned-portable.zip',
  ]);
  assert.deepEqual(platformAssets('1.3.2', 'macos', 'arm64'), [
    'Repo-Creator-1.3.2-macos-arm64-adhoc.dmg',
    'Repo-Creator-1.3.2-macos-arm64-adhoc.app.tar.gz',
  ]);
  assert.throws(() => platformAssets('1.3.2', 'windows', 'arm64'));
});
test('lockfile version drift blocks release preparation even when manifests agree', () => {
  for (const part of ['top-level', 'root-package', 'cargo-lock']) {
    const root = manifestFixture();
    if (part === 'cargo-lock')
      put(
        root,
        'src-tauri/Cargo.lock',
        'version = 4\n\n[[package]]\nname = "repo-creator"\nversion = "1.3.1"\n',
      );
    else {
      const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
      if (part === 'top-level') lock.version = '1.3.1';
      else lock.packages[''].version = '1.3.1';
      put(root, 'package-lock.json', JSON.stringify(lock));
    }
    assert.throws(() => checkVersions(root, '1.3.2', 'v1.3.2'), /Version mismatch/);
  }
});
test('Windows packaging verifies native architecture and includes notices in portable archives', () => {
  const root = directory();
  const source = path.join(root, 'build');
  const output = path.join(root, 'distribution');
  const exe = Buffer.alloc(128);
  exe.write('MZ');
  exe.writeUInt32LE(64, 60);
  exe.write('PE\0\0', 64);
  exe.writeUInt16LE(0x8664, 68);
  put(root, 'LICENSE', 'Project license\n');
  put(root, 'THIRD_PARTY_NOTICES.txt', 'Third party notices\n');
  put(source, 'repo-creator.exe', exe);
  put(source, 'bundle/nsis/Repo Creator_1.3.2_x64-setup.exe', 'test installer');
  put(source, 'bundle/msi/Repo Creator_1.3.2_x64_en-US.msi', 'test msi');
  let archiveChecked = false;
  const archive = (_, args) => {
    const staging = args[args.indexOf('-Source') + 1];
    assert.deepEqual(readdirSync(staging).sort(), [
      'LICENSE.txt',
      'README.txt',
      'Repo Creator.exe',
      'THIRD_PARTY_NOTICES.txt',
    ]);
    assert.equal(
      readFileSync(path.join(staging, 'THIRD_PARTY_NOTICES.txt'), 'utf8'),
      'Third party notices\n',
    );
    put(root, path.relative(root, args.at(-1)), 'test archive');
    archiveChecked = true;
  };
  const result = packagePlatform({
    root,
    source,
    output,
    version: '1.3.2',
    platform: 'windows',
    architecture: 'x64',
    archive,
  });
  assert.equal(archiveChecked, true);
  assert.equal(
    readFileSync(path.join(output, result.manifest), 'utf8').trim().split('\n').length,
    3,
  );
  assert.throws(
    () =>
      packagePlatform({
        root,
        source,
        output,
        version: '1.3.2',
        platform: 'windows',
        architecture: 'x64',
        archive,
      }),
    /must be empty/,
  );
  exe.writeUInt16LE(0x14c, 68);
  put(source, 'repo-creator.exe', exe);
  assert.throws(
    () =>
      packagePlatform({
        root,
        source,
        output: path.join(root, 'invalid'),
        version: '1.3.2',
        platform: 'windows',
        architecture: 'x64',
        archive,
      }),
    /x64 PE/,
  );
});
function releaseFixture() {
  const root = directory();
  const source = path.join(root, 'downloaded');
  put(root, 'LICENSE', 'Project license\n');
  put(root, 'THIRD_PARTY_NOTICES.txt', 'Third party notices\n');
  for (const [platform, architecture] of [
    ['windows', 'x64'],
    ['macos', 'arm64'],
    ['macos', 'x64'],
  ]) {
    const folder = path.join(source, `${platform}-${architecture}`);
    const names = platformAssets('1.3.2', platform, architecture);
    for (const name of names) put(folder, name, `test payload ${name}`);
    checksums(folder, names, `SHA256SUMS-${platform}-${architecture}.txt`);
  }
  return { root, source, output: path.join(root, 'release'), version: '1.3.2' };
}
test('release assembly requires all platform sets and verifies their checksums before writing output', () => {
  const fixture = releaseFixture();
  const assets = collectRelease(fixture);
  assert.equal(assets.length, 7);
  assert.equal(
    readFileSync(path.join(fixture.output, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').length,
    9,
  );
  assert.equal(readdirSync(fixture.output).length, 11);
  const tampered = releaseFixture();
  put(
    tampered.source,
    'macos-arm64/Repo-Creator-1.3.2-macos-arm64-adhoc.dmg',
    'changed after packaging',
  );
  assert.throws(() => collectRelease(tampered), /checksum/);
  const missing = releaseFixture();
  removeOwned(path.join(missing.source, 'windows-x64'));
  assert.throws(() => collectRelease(missing), /exactly/);
});
test('release assembly rejects duplicate and unexpected files instead of publishing developer folders', () => {
  const duplicate = releaseFixture();
  const asset = platformAssets('1.3.2', 'macos', 'x64')[0];
  mkdirSync(path.join(duplicate.source, 'unexpected'));
  copyFileSync(
    path.join(duplicate.source, 'macos-x64', asset),
    path.join(duplicate.source, 'unexpected', asset),
  );
  assert.throws(() => collectRelease(duplicate), /Duplicate/);
  const extra = releaseFixture();
  put(extra.source, 'build.log', 'not a release asset');
  assert.throws(() => collectRelease(extra), /exactly/);
});
