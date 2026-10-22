import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {
  buildFeeds,
  compareVersions,
  eligibleReleases,
  requiredAssets,
  validateRelease,
} from './update-feeds.mjs';
import { verifyUpdaterSignature } from './updater-signatures.mjs';
import { collectRelease, platformAssets, checksums, packagePlatform } from './release.mjs';

const fixture = JSON.parse(
  readFileSync(new URL('../tests/fixtures/updater-signature.json', import.meta.url), 'utf8'),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const payload = Buffer.from(fixture.payload);
const releases = [
  {
    id: 1,
    tag_name: 'v1.4.2',
    published_at: '2026-10-22T12:00:00Z',
    prerelease: false,
    draft: false,
    assets: [{ name: 'updater.json' }],
  },
  {
    id: 2,
    tag_name: 'v1.5.0-beta.2',
    published_at: '2026-10-23T12:00:00Z',
    prerelease: true,
    draft: false,
    assets: [{ name: 'updater.json' }],
  },
  { id: 3, tag_name: 'v9.0.0', published_at: null, prerelease: false, draft: true, assets: [] },
  {
    id: 4,
    tag_name: 'v1.4.0',
    published_at: '2026-10-24T12:00:00Z',
    prerelease: true,
    draft: false,
    assets: [],
  },
  {
    id: 5,
    tag_name: 'v1.5.0-beta.1',
    published_at: '2026-10-25T12:00:00Z',
    prerelease: false,
    draft: false,
    assets: [{ name: 'updater.json' }],
  },
];
function publishedFixture() {
  const version = fixture.version;
  const files = new Map(requiredAssets(version).map((name) => [name, payload]));
  const platforms = {};
  for (const [target, file] of [
    ['windows-x86_64-nsis', platformAssets(version, 'windows', 'x64')[0]],
    ['windows-x86_64-msi', platformAssets(version, 'windows', 'x64')[1]],
    ['darwin-aarch64', platformAssets(version, 'macos', 'arm64')[1]],
    ['darwin-x86_64', platformAssets(version, 'macos', 'x64')[1]],
  ]) {
    files.set(file + '.sig', Buffer.from(fixture.signature));
    platforms[target] = {
      url: `https://github.com/DefinitivedCode/RepoCreator/releases/download/v${version}/${file}`,
      signature: fixture.signature,
    };
  }
  files.set('updater.json', Buffer.from(JSON.stringify({ version, platforms })));
  files.set(
    'SHA256SUMS.txt',
    Buffer.from(
      [...files]
        .filter(([name]) => name !== 'SHA256SUMS.txt')
        .map(([name, bytes]) => `${hash(bytes)}  ${name}\n`)
        .join(''),
    ),
  );
  const release = {
    ...releases[0],
    body: 'Published release notes',
    assets: [...files].map(([name, bytes]) => ({
      name,
      state: 'uploaded',
      size: bytes.length,
      browser_download_url: `https://github.com/DefinitivedCode/RepoCreator/releases/download/v${version}/${name}`,
    })),
  };
  return { release, files, load: async (asset) => files.get(asset.name) };
}
test('channel eligibility excludes drafts and prereleases from stable, and uses semver instead of publication order', async () => {
  assert.deepEqual(
    eligibleReleases(releases, 'stable').map((release) => release.id),
    [1],
  );
  assert.deepEqual(
    eligibleReleases(releases, 'beta').map((release) => release.id),
    [2, 5, 1, 4],
  );
  assert.ok(compareVersions('1.5.0-beta.10', '1.5.0-beta.2') > 0);
  assert.ok(compareVersions('1.5.0', '1.5.0-beta.99') > 0);
  assert.ok(compareVersions('1.5.0-beta.1', '1.5.0-2') > 0);
  const feeds = await buildFeeds(releases, async (release) => ({
    version: release.tag_name.slice(1),
  }));
  assert.equal(feeds.stable.version, '1.4.2');
  assert.equal(feeds.beta.version, '1.5.0-beta.2');
  const stable = await buildFeeds([releases[0]], async (release) => ({
    version: release.tag_name.slice(1),
  }));
  assert.equal(stable.beta.version, stable.stable.version);
  assert.equal((await buildFeeds([], () => assert.fail())).stable.version, '0.0.0');
});
test('Tauri CLI signatures verify with native crypto; tampered bytes, keys and version substitutions fail', () => {
  verifyUpdaterSignature(payload, fixture.signature, fixture.publicKey, fixture.version);
  assert.throws(
    () =>
      verifyUpdaterSignature(
        Buffer.from('changed'),
        fixture.signature,
        fixture.publicKey,
        fixture.version,
      ),
    /verification/,
  );
  assert.throws(
    () => verifyUpdaterSignature(payload, fixture.signature, fixture.publicKey, '9.9.9'),
    /version/,
  );
  const tamperedComment = Buffer.from(
    Buffer.from(fixture.signature, 'base64')
      .toString('utf8')
      .replace('version:1.4.2', 'version:9.9.9'),
  ).toString('base64');
  assert.throws(
    () => verifyUpdaterSignature(payload, tamperedComment, fixture.publicKey, '9.9.9'),
    /verification/,
  );
  assert.throws(() =>
    verifyUpdaterSignature(payload, 'invalid', fixture.publicKey, fixture.version),
  );
  const key = Buffer.from(fixture.publicKey, 'base64').toString().split('\n');
  const bytes = Buffer.from(key[1], 'base64');
  bytes[3] ^= 1;
  key[1] = bytes.toString('base64');
  assert.throws(
    () =>
      verifyUpdaterSignature(
        payload,
        fixture.signature,
        Buffer.from(key.join('\n')).toString('base64'),
        fixture.version,
      ),
    /key mismatch/,
  );
});
test('published release validation checks all installer types, package signatures, metadata and checksums', async () => {
  const { release, load } = publishedFixture();
  const manifest = await validateRelease(release, load, fixture.publicKey);
  assert.equal(manifest.version, fixture.version);
  assert.equal(manifest.notes, 'Published release notes');
  assert.equal(Object.keys(manifest.platforms).length, 4);
  await assert.rejects(
    () => validateRelease({ ...release, draft: true }, load, fixture.publicKey),
    /Unpublished/,
  );
  await assert.rejects(
    () => validateRelease({ ...release, assets: release.assets.slice(1) }, load, fixture.publicKey),
    /incomplete/,
  );
  await assert.rejects(
    () =>
      validateRelease(
        release,
        async (asset) => (asset.name.endsWith('.msi') ? Buffer.from('damaged') : load(asset)),
        fixture.publicKey,
      ),
    /checksum/,
  );
  const changed = publishedFixture();
  const entry = changed.release.assets.find((asset) => asset.name.endsWith('.dmg'));
  entry.browser_download_url = 'http://example.invalid/file';
  await assert.rejects(
    () => validateRelease(changed.release, changed.load, fixture.publicKey),
    /inventory/,
  );
});
test('incomplete releases never enter feeds; network failures leave existing feeds untouched', async () => {
  const incomplete = publishedFixture();
  incomplete.release.assets.pop();
  const feeds = await buildFeeds(
    [incomplete.release],
    (release) => validateRelease(release, incomplete.load, fixture.publicKey),
    () => {},
  );
  assert.equal(feeds.stable.version, '0.0.0');
  assert.equal(feeds.beta.version, '0.0.0');
  await assert.rejects(
    () =>
      buildFeeds(releases, async () => {
        throw new Error('offline');
      }),
    /offline/,
  );
  const valid = publishedFixture();
  await assert.rejects(
    () =>
      buildFeeds([valid.release], (release) =>
        validateRelease(
          release,
          async (asset) => {
            if (asset.name === 'updater.json') throw new Error('offline metadata request');
            return valid.load(asset);
          },
          fixture.publicKey,
        ),
      ),
    /offline metadata request/,
  );
  const fallback = await buildFeeds(
    [{ ...incomplete.release, id: 99, tag_name: 'v9.0.0' }, valid.release],
    (release) => validateRelease(release, valid.load, fixture.publicKey),
    () => {},
  );
  assert.equal(fallback.stable.version, fixture.version);
  assert.equal(fallback.beta.version, fixture.version);
});
test('signed release assembly retains the complete artifact set and embeds the exact signatures', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'repo-creator-signed-release-'));
  try {
    const source = path.join(root, 'downloaded'),
      output = path.join(root, 'release');
    mkdirSync(source);
    writeFileSync(path.join(root, 'LICENSE'), 'license');
    writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.txt'), 'notices');
    for (const [platform, arch] of [
      ['windows', 'x64'],
      ['macos', 'arm64'],
      ['macos', 'x64'],
    ]) {
      const directory = path.join(source, `${platform}-${arch}`);
      mkdirSync(directory);
      const names = platformAssets(fixture.version, platform, arch, true);
      for (const name of names)
        writeFileSync(
          path.join(directory, name),
          name.endsWith('.sig') ? fixture.signature : payload,
        );
      checksums(directory, names, `SHA256SUMS-${platform}-${arch}.txt`);
    }
    const names = collectRelease({
      root,
      source,
      output,
      version: fixture.version,
      updater: true,
      publicKey: fixture.publicKey,
    });
    assert.equal(names.length, 11);
    assert.equal(readdirSync(output).length, 16);
    const metadata = JSON.parse(readFileSync(path.join(output, 'updater.json'), 'utf8'));
    assert.equal(metadata.platforms['darwin-aarch64'].signature, fixture.signature);
    const bad = path.join(root, 'bad');
    assert.throws(() =>
      collectRelease({
        root,
        source,
        output: bad,
        version: fixture.version,
        updater: true,
        publicKey: 'invalid',
      }),
    );
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('repo-creator-signed-release-'));
    rmSync(root, { recursive: true });
  }
});
test('signed Mac packaging copies the Tauri archive without recompressing it', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'repo-creator-signed-mac-'));
  try {
    const source = path.join(root, 'bundle'),
      output = path.join(root, 'distribution');
    mkdirSync(path.join(source, 'macos', 'Repo Creator.app', 'Contents', 'MacOS'), {
      recursive: true,
    });
    mkdirSync(path.join(source, 'dmg'));
    writeFileSync(
      path.join(source, 'macos', 'Repo Creator.app', 'Contents', 'MacOS', 'repo-creator'),
      payload,
    );
    writeFileSync(path.join(source, 'macos', 'Repo Creator.app.tar.gz'), payload);
    writeFileSync(path.join(source, 'macos', 'Repo Creator.app.tar.gz.sig'), fixture.signature);
    writeFileSync(path.join(source, 'dmg', 'app.dmg'), payload);
    const result = packagePlatform({
      root,
      source,
      output,
      version: fixture.version,
      platform: 'macos',
      architecture: 'arm64',
      updater: true,
      archive: () => assert.fail('Signed archive must not be repacked'),
    });
    assert.deepEqual(readFileSync(path.join(output, result.names[1])), payload);
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('repo-creator-signed-mac-'));
    rmSync(root, { recursive: true });
  }
});
test('release workflows keep signing out of pull requests and feed writes out of release preparation', () => {
  const workflow = (name) =>
    readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
  const release = workflow('release'),
    build = workflow('windows'),
    feeds = workflow('update-feeds');
  assert.match(release, /sign_updates: true/);
  assert.match(release, /--draft/);
  assert.match(release, /--updater true/);
  assert.match(release, /release-assets\/updater\.json/);
  assert.match(build, /inputs\.sign_updates && secrets\.TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(build, /Repo-Creator-\*\.sig/);
  assert.match(feeds, /types: \[published,/);
  assert.match(feeds, /ref: main/);
  assert.doesNotMatch(feeds, /TAURI_SIGNING_PRIVATE_KEY|gh release create|--publish/);
});
