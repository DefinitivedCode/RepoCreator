import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
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
  checkDraftMetadata,
  checksums,
  collectRelease,
  packagePlatform,
  platformAssets,
  releaseVersion,
  releaseChannel,
  reviewedReleaseNotes,
  validateReleaseNotes,
} from './release.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

function finalNotes(version = '1.3.2') {
  return `# Repo Creator ${version} — Verified Workspace Improvements

This release improves project setup and everyday workspace use.

### What's New

- **Setup** — Review project configuration more clearly.
- **Workspace** — Keep project controls accessible.
- **Reliability** — Recover from failed checks.

### Installation

Users of v1.4.0 and earlier must upgrade manually. Portable ZIP copies require manual replacement; extract the entire archive. Move the Mac app out of its DMG.

**Known limitations:**

- Windows installers remain unsigned at the operating-system level. Cryptographic updater signatures do not provide operating-system code signing.
- macOS builds are ad-hoc signed and not notarized; physical Mac launch remains unverified.
- Installation and updater testing remain unverified for this fixture.

### Feedback

[Open an issue](https://github.com/DefinitivedCode/RepoCreator/issues).
`;
}

test('explicit channels preserve Beta/Stable semantics and reject unsafe combinations', () => {
  assert.equal(releaseChannel('1.3.2', 'beta'), 'beta');
  assert.equal(releaseChannel('1.3.2-beta.1', 'beta'), 'beta');
  assert.equal(releaseChannel('1.3.2', 'stable'), 'stable');
  for (const channel of ['', 'preview', 'Beta'])
    assert.throws(() => releaseChannel('1.3.2', channel), /channel/);
  assert.throws(() => releaseChannel('1.3.2-beta.1', 'stable'), /Stable/);
});

test('reviewed notes reject incomplete, mismatched or unsafe publication text', () => {
  const notes = finalNotes();
  assert.equal(validateReleaseNotes(notes, '1.3.2', 'beta'), notes);
  for (const broken of [
    notes.replace('Repo Creator 1.3.2', 'Repo Creator 1.3.1'),
    notes.replace(
      'This release improves project setup and everyday workspace use.',
      '{{introduction}}',
    ),
    notes.replace('This release improves project setup and everyday workspace use.', ''),
    notes.replace('### Installation', '### Missing'),
    notes.replace('- **Reliability** — Recover from failed checks.\n', ''),
    notes.replace('### Installation', '- Four\n- Five\n- Six\n- Seven\n\n### Installation'),
    notes.replace('Windows installers remain unsigned', 'Windows installers are signed'),
    notes.replace('ad-hoc signed and not notarized', 'fully notarized'),
    notes.replace(
      'Cryptographic updater signatures do not provide operating-system code signing.',
      '',
    ),
    notes.replace(
      'Portable ZIP copies require manual replacement; extract the entire archive.',
      '',
    ),
    notes.replace(
      'https://github.com/DefinitivedCode/RepoCreator/issues',
      'https://example.invalid',
    ),
  ])
    assert.throws(() => validateReleaseNotes(broken, '1.3.2', 'beta'));
  assert.throws(() =>
    validateReleaseNotes(
      'Repo Creator 1.3.2\nChoose an asset. This workflow prepares a draft only.',
      '1.3.2',
      'beta',
    ),
  );
});

test('explicit-channel assembly carries exact tagged notes and fails before output for missing notes', () => {
  const fixture = releaseFixture();
  const notes = finalNotes();
  put(fixture.root, 'docs/release-notes/1.3.2.md', notes);
  assert.equal(reviewedReleaseNotes(fixture.root, '1.3.2', 'beta'), notes);
  collectRelease({ ...fixture, channel: 'beta' });
  assert.equal(readFileSync(path.join(fixture.output, 'RELEASE_NOTES.md'), 'utf8'), notes);
  const missing = releaseFixture();
  assert.throws(() => collectRelease({ ...missing, channel: 'beta' }), /ENOENT/);
  assert.equal(readdirSync(missing.root).includes('release'), false);
  put(missing.root, 'docs/release-notes/1.3.2.md', 'Unreviewed boilerplate');
  assert.throws(() => collectRelease({ ...missing, channel: 'beta' }), /heading/);
  assert.equal(readdirSync(missing.root).includes('release'), false);
});

test('actual draft readback rejects wrong channel, title, tag, publication and body', () => {
  const notes = finalNotes();
  const draft = {
    name: 'Repo Creator 1.3.2',
    tagName: 'v1.3.2',
    isDraft: true,
    isPrerelease: true,
    body: notes,
  };
  checkDraftMetadata(draft, '1.3.2', 'beta', notes);
  checkDraftMetadata(
    { ...draft, isPrerelease: false, body: notes.replaceAll('\n', '\r\n') },
    '1.3.2',
    'stable',
    notes,
  );
  for (const changed of [
    { name: 'Repo Creator 1.3.2 Beta' },
    { tagName: 'v1.3.1' },
    { isDraft: false },
    { isPrerelease: false },
    { body: 'Generic preparation boilerplate' },
  ])
    assert.throws(() => checkDraftMetadata({ ...draft, ...changed }, '1.3.2', 'beta', notes));
});

test('collect CLI forwards the explicit channel and preserves the final body', () => {
  const fixture = releaseFixture();
  const notes = finalNotes();
  put(fixture.root, 'docs/release-notes/1.3.2.md', notes);
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('./release.mjs', import.meta.url)),
      'collect',
      '--root',
      fixture.root,
      '--version',
      '1.3.2',
      '--channel',
      'stable',
      '--source',
      fixture.source,
      '--output',
      fixture.output,
    ],
    { windowsHide: true },
  );
  assert.equal(readFileSync(path.join(fixture.output, 'RELEASE_NOTES.md'), 'utf8'), notes);
});

test('draft workflow uses exact channel flags and refuses duplicate release creation with a local gh stub', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
  const step = workflow
    .split('      - name: Refuse an existing release and create a draft only\n')[1]
    .split('      - name: Read back actual draft metadata\n')[0];
  const script = step
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
  // A function intercepts every gh call; this test cannot contact GitHub.
  const fakeGh = `gh() {
  if [ "$1" = api ]; then
    printf '%s\\n' "$EXISTING_TAGS"
  elif [ "$1" = release ] && [ "$2" = create ]; then
    printf '%s\\0' "$@" > "$CAPTURE"
  else
    return 99
  fi
}
`;
  let bash = 'bash';
  if (process.platform === 'win32') {
    const git = execFileSync('where.exe', ['git.exe'], { encoding: 'utf8', windowsHide: true })
      .trim()
      .split(/\r?\n/)[0];
    bash = path.join(path.dirname(path.dirname(git)), 'bin', 'bash.exe');
  }
  for (const channel of ['beta', 'stable', '']) {
    for (const duplicate of [false, true]) {
      const root = directory();
      for (const name of [
        'Repo-Creator-test.zip',
        'LICENSE.txt',
        'THIRD_PARTY_NOTICES.txt',
        'SHA256SUMS.txt',
        'updater.json',
        'RELEASE_NOTES.md',
      ])
        put(root, `release-assets/${name}`, 'fixture');
      const options = {
        cwd: root,
        windowsHide: true,
        stdio: 'pipe',
        env: {
          ...process.env,
          TAG: 'v1.3.2',
          VERSION: '1.3.2',
          CHANNEL: channel,
          GH_REPO: 'fixture/repo',
          GITHUB_STEP_SUMMARY: 'summary.md',
          CAPTURE: 'arguments.bin',
          EXISTING_TAGS: duplicate ? 'v1.3.2' : '',
        },
      };
      if (duplicate) {
        assert.throws(() => execFileSync(bash, ['-e', '-c', fakeGh + script], options));
        assert.equal(existsSync(path.join(root, 'arguments.bin')), false);
      } else {
        execFileSync(bash, ['-e', '-c', fakeGh + script], options);
        const args = readFileSync(path.join(root, 'arguments.bin'), 'utf8')
          .split('\0')
          .filter(Boolean);
        assert.deepEqual(args.slice(0, 3), ['release', 'create', 'v1.3.2']);
        assert(args.includes('--verify-tag') && args.includes('--draft'));
        assert.equal(args[args.indexOf('--title') + 1], 'Repo Creator 1.3.2');
        assert.equal(args[args.indexOf('--notes-file') + 1], 'release-assets/RELEASE_NOTES.md');
        assert.equal(args.includes('--prerelease'), channel === 'beta');
        assert.equal(args.includes('--prerelease=false'), channel === 'stable');
      }
    }
  }
});
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
