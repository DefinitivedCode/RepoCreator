import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { platformAssets, releaseVersion } from './release.mjs';
import { verifyUpdaterSignature } from './updater-signatures.mjs';

const repository = 'DefinitivedCode/RepoCreator';
const branch = 'update-feeds';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
class InvalidRelease extends Error {}
export function compareVersions(left, right) {
  const parts = (value) => {
    releaseVersion(value);
    const [core, ...rest] = value.split('-');
    return { core: core.split('.').map(BigInt), pre: rest.join('-').split('.').filter(Boolean) };
  };
  const a = parts(left),
    b = parts(right);
  for (let index = 0; index < 3; index++) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (!a.pre.length || !b.pre.length)
    return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index++) {
    const x = a.pre[index],
      y = b.pre[index];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const numericX = /^\d+$/.test(x),
      numericY = /^\d+$/.test(y);
    if (numericX && numericY) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (numericX !== numericY) return numericX ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}
export function eligibleReleases(releases, channel) {
  return releases
    .filter((release) => {
      if (release.draft || !release.published_at || !release.tag_name?.startsWith('v'))
        return false;
      try {
        releaseVersion(release.tag_name.slice(1));
      } catch {
        return false;
      }
      return channel === 'beta' || (!release.prerelease && !release.tag_name.includes('-'));
    })
    .sort((a, b) => compareVersions(b.tag_name.slice(1), a.tag_name.slice(1)));
}
export function requiredAssets(version) {
  return [
    ...[
      ['windows', 'x64'],
      ['macos', 'arm64'],
      ['macos', 'x64'],
    ].flatMap(([platform, arch]) => platformAssets(version, platform, arch, true)),
    'LICENSE.txt',
    'THIRD_PARTY_NOTICES.txt',
    'updater.json',
    'SHA256SUMS.txt',
  ];
}
export async function validateRelease(release, load, publicKey) {
  if (release.draft || !release.published_at) throw new InvalidRelease('Unpublished release.');
  const version = releaseVersion(release.tag_name.slice(1));
  const required = requiredAssets(version);
  const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
  for (const name of required) {
    const asset = assets.get(name);
    if (
      !asset ||
      asset.state !== 'uploaded' ||
      !(asset.size > 0) ||
      asset.browser_download_url !==
        `https://github.com/${repository}/releases/download/v${version}/${name}`
    )
      throw new InvalidRelease('Release asset inventory is incomplete.');
  }
  const sums = (await load(assets.get('SHA256SUMS.txt'))).toString('utf8').trimEnd().split('\n');
  const expected = new Map();
  for (const line of sums) {
    const entry = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (
      !entry ||
      expected.has(entry[2]) ||
      !required.includes(entry[2]) ||
      entry[2] === 'SHA256SUMS.txt'
    )
      throw new InvalidRelease('Invalid release checksum inventory.');
    expected.set(entry[2], entry[1]);
  }
  if (expected.size !== required.length - 1)
    throw new InvalidRelease('Incomplete release checksums.');
  const verified = async (name) => {
    const bytes = await load(assets.get(name));
    if (bytes.length !== assets.get(name).size || sha256(bytes) !== expected.get(name))
      throw new InvalidRelease('Release checksum verification failed.');
    return bytes;
  };
  let manifest;
  const metadata = await verified('updater.json');
  try {
    manifest = JSON.parse(metadata.toString('utf8'));
  } catch (error) {
    throw new InvalidRelease(`Invalid updater metadata: ${error.message}`);
  }
  const targets = {
    'windows-x86_64-nsis': platformAssets(version, 'windows', 'x64')[0],
    'windows-x86_64-msi': platformAssets(version, 'windows', 'x64')[1],
    'darwin-aarch64': platformAssets(version, 'macos', 'arm64')[1],
    'darwin-x86_64': platformAssets(version, 'macos', 'x64')[1],
  };
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    manifest.version !== version ||
    Object.keys(manifest.platforms ?? {})
      .sort()
      .join() !== Object.keys(targets).sort().join()
  )
    throw new InvalidRelease('Updater version or platform inventory mismatch.');
  const signatures = new Map();
  for (const file of Object.values(targets))
    signatures.set(file, (await verified(`${file}.sig`)).toString('utf8').trim());
  for (const name of required.filter(
    (name) => !name.endsWith('.sig') && !['SHA256SUMS.txt', 'updater.json'].includes(name),
  )) {
    const bytes = await verified(name);
    if (signatures.has(name)) {
      try {
        verifyUpdaterSignature(bytes, signatures.get(name), publicKey, version);
      } catch (error) {
        throw new InvalidRelease(error.message);
      }
    }
  }
  for (const [target, file] of Object.entries(targets)) {
    const entry = manifest.platforms[target];
    if (
      !entry ||
      entry.url !== assets.get(file).browser_download_url ||
      entry.signature !== signatures.get(file)
    )
      throw new InvalidRelease('Updater URLs or signatures do not match verified release assets.');
  }
  return {
    ...manifest,
    notes: release.body || 'No release notes were provided.',
    pub_date: release.published_at,
  };
}
export async function buildFeeds(releases, validate, warn = console.warn) {
  const cache = new Map();
  const feeds = {};
  for (const channel of ['stable', 'beta']) {
    for (const release of eligibleReleases(releases, channel)) {
      // Pre-updater releases are intentionally ineligible (including v1.4.0).
      if (!release.assets.some((asset) => asset.name === 'updater.json')) continue;
      if (!cache.has(release.id)) {
        try {
          cache.set(release.id, await validate(release));
        } catch (error) {
          if (!(error instanceof InvalidRelease)) throw error;
          warn(`Skipping ${release.tag_name}: ${error.message}`);
          cache.set(release.id, null);
        }
      }
      if (cache.get(release.id)) {
        feeds[channel] = cache.get(release.id);
        break;
      }
    }
    feeds[channel] ??= {
      version: '0.0.0',
      notes: 'No published eligible updates are available.',
      platforms: {},
    };
  }
  return feeds;
}
function gh(endpoint, method = 'GET', body) {
  return JSON.parse(
    execFileSync('gh', ['api', endpoint, '--method', method, ...(body ? ['--input', '-'] : [])], {
      input: body ? JSON.stringify(body) : undefined,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
  );
}
async function main() {
  if (process.env.GITHUB_REPOSITORY !== repository)
    throw new Error('Update feeds may only be maintained in the upstream repository.');
  const publicKey = process.env.REPO_CREATOR_UPDATER_PUBLIC_KEY;
  if (!publicKey) throw new Error('The owner must configure REPO_CREATOR_UPDATER_PUBLIC_KEY.');
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = gh(`repos/${repository}/releases?per_page=100&page=${page}`);
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  const load = async (asset) => {
    if (asset.size > 512 * 1024 * 1024)
      throw new InvalidRelease('Release asset exceeds the update validation limit.');
    const response = await fetch(asset.browser_download_url, {
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok)
      throw new Error('Published asset download failed; existing feeds were not changed.');
    return Buffer.from(await response.arrayBuffer());
  };
  const feeds = await buildFeeds(releases, (release) => validateRelease(release, load, publicKey));
  // One atomic Git ref update publishes both channels. Never write to protected main.
  const refs = gh(`repos/${repository}/git/matching-refs/heads/${branch}`);
  const parent = refs.find((ref) => ref.ref === `refs/heads/${branch}`)?.object.sha;
  const tree = Object.entries(feeds).map(([channel, manifest]) => ({
    path: `${channel}.json`,
    mode: '100644',
    type: 'blob',
    content: JSON.stringify(manifest, null, 2) + '\n',
  }));
  const previous = parent ? gh(`repos/${repository}/git/commits/${parent}`) : null;
  const createdTree = gh(`repos/${repository}/git/trees`, 'POST', { tree });
  if (previous?.tree.sha === createdTree.sha) {
    console.log('Update feeds are unchanged.');
    return;
  }
  const commit = gh(`repos/${repository}/git/commits`, 'POST', {
    message: 'Refresh verified published update channels',
    tree: createdTree.sha,
    parents: parent ? [parent] : [],
  });
  if (parent)
    gh(`repos/${repository}/git/refs/heads/${branch}`, 'PATCH', { sha: commit.sha, force: false });
  else gh(`repos/${repository}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha: commit.sha });
  console.log('Stable and Beta feeds refreshed from verified published releases.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      'Update feed refresh failed. Existing feeds were not changed; inspect release assets and workflow configuration.',
    );
    // Feed maintenance never receives private signing secrets; report actionable API/config errors.
    console.error(error.message);
    process.exitCode = 1;
  });
}
