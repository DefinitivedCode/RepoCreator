import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertNoPrivateBuildPaths } from './build-desktop.mjs';
import { verifyUpdaterSignature } from './updater-signatures.mjs';

const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
export function releaseVersion(value) {
  if (typeof value !== 'string' || !versionPattern.test(value) || /\s/.test(value))
    throw new Error('Use a version such as 1.4.1 or 1.5.0-beta.1.');
  return value;
}

export function releaseChannel(version, channel) {
  releaseVersion(version);
  if (!['beta', 'stable'].includes(channel))
    throw new Error('Release channel must be beta or stable.');
  if (channel === 'stable' && version.includes('-'))
    throw new Error('Stable releases cannot use a SemVer prerelease version.');
  return channel;
}

export function validateReleaseNotes(notes, version, channel) {
  releaseChannel(version, channel);
  const text = notes.replaceAll('\r\n', '\n').trim();
  const title = `# Repo Creator ${version} — `;
  if (!text.startsWith(title) || !text.split('\n')[0].slice(title.length).trim())
    throw new Error('Release notes need the matching version and a descriptive Markdown heading.');
  if (/\{\{|\}\}|^\s*(?:TODO|TBD)\b|This workflow prepares a draft only\./im.test(text))
    throw new Error('Release notes contain placeholders or preparation boilerplate.');
  const headings = ["### What's New", '### Installation', '**Known limitations:**', '### Feedback'];
  const positions = headings.map((heading) => text.indexOf(heading));
  if (
    positions.some(
      (position, index) =>
        position < 0 ||
        position !== text.lastIndexOf(headings[index]) ||
        (index > 0 && position <= positions[index - 1]),
    )
  )
    throw new Error('Release notes must contain the complete sections in the documented order.');
  const introduction = text.slice(text.indexOf('\n') + 1, positions[0]).trim();
  if (!introduction || introduction.startsWith('#'))
    throw new Error('Release notes need a concise introduction.');
  const features =
    text.slice(positions[0] + headings[0].length, positions[1]).match(/^- \S.+/gm) || [];
  if (features.length < 3 || features.length > 6)
    throw new Error('Release notes need three to six feature bullets.');
  const installation = text.slice(positions[1], positions[2]);
  if (
    !/1\.4\.0/.test(installation) ||
    !/manual/i.test(installation) ||
    !/portable/i.test(installation) ||
    !/extract/i.test(installation)
  )
    throw new Error('Release notes must preserve manual-upgrade and portable extraction guidance.');
  const warnings = text.slice(positions[2], positions[3]);
  if (
    !/Windows[^\n]*unsigned/i.test(warnings) ||
    !/macOS[^\n]*ad[- ]hoc/i.test(warnings) ||
    !/macOS[^\n]*(?:not notarized|unnotarized)/i.test(warnings) ||
    !/updater signatures[^\n]*(?:do not|don't)[^\n]*signing/i.test(warnings)
  )
    throw new Error(
      'Release notes must retain Windows, macOS and updater-versus-OS signing warnings.',
    );
  if (!text.slice(positions[3]).includes('https://github.com/DefinitivedCode/RepoCreator/issues'))
    throw new Error('Release notes need the GitHub Issues feedback link.');
  return notes;
}

export function reviewedReleaseNotes(root, version, channel) {
  releaseChannel(version, channel);
  const file = path.join(root, 'docs', 'release-notes', `${version}.md`);
  return validateReleaseNotes(readFileSync(file, 'utf8'), version, channel);
}

export function checkDraftMetadata(release, version, channel, notes) {
  validateReleaseNotes(notes, version, channel);
  if (
    release.name !== `Repo Creator ${version}` ||
    release.tagName !== `v${version}` ||
    release.isDraft !== true
  )
    throw new Error('Expected the matching unpublished draft with the exact release title.');
  if (release.isPrerelease !== (channel === 'beta'))
    throw new Error('Draft prerelease flag does not match the release channel.');
  if (
    typeof release.body !== 'string' ||
    release.body.replaceAll('\r\n', '\n') !== notes.replaceAll('\r\n', '\n')
  )
    throw new Error('Actual draft body does not match the reviewed release notes.');
}

export function checkVersions(root, expected, tag) {
  const json = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  const cargoVersion = (file, section) => {
    const source = readFileSync(path.join(root, file), 'utf8');
    const block = source
      .split(section)
      .slice(1)
      .find((part) => /(?:^|\n)name = "repo-creator"\r?\n/.test(part.split(/\r?\n\[/)[0]));
    const version = block?.split(/\r?\n\[/)[0].match(/(?:^|\n)version = "([^"]+)"/);
    if (!version) throw new Error(`Missing application version in ${file}.`);
    return version[1];
  };
  const lock = json('package-lock.json');
  const values = [
    ['package.json', json('package.json').version],
    ['package-lock.json', lock.version],
    ['package-lock.json root package', lock.packages?.['']?.version],
    ['src-tauri/tauri.conf.json', json('src-tauri/tauri.conf.json').version],
    ['src-tauri/Cargo.toml', cargoVersion('src-tauri/Cargo.toml', '[package]')],
    ['src-tauri/Cargo.lock', cargoVersion('src-tauri/Cargo.lock', '[[package]]')],
  ];
  const version = releaseVersion(expected || values[0][1]);
  for (const [file, value] of values)
    if (value !== version) throw new Error(`Version mismatch in ${file}; expected ${version}.`);
  if (tag && tag !== `v${version}`)
    throw new Error('Release tag must exactly match v plus the application version.');
  return version;
}

export function platformAssets(version, platform, architecture, updater = false) {
  releaseVersion(version);
  if (platform === 'windows' && architecture === 'x64')
    return [
      'unsigned-setup.exe',
      'unsigned.msi',
      'unsigned-portable.zip',
      ...(updater ? ['unsigned-setup.exe.sig', 'unsigned.msi.sig'] : []),
    ].map((suffix) => `Repo-Creator-${version}-windows-x64-${suffix}`);
  if (platform === 'macos' && ['arm64', 'x64'].includes(architecture))
    return ['dmg', 'app.tar.gz', ...(updater ? ['app.tar.gz.sig'] : [])].map(
      (extension) => `Repo-Creator-${version}-macos-${architecture}-adhoc.${extension}`,
    );
  throw new Error('Unsupported distribution platform or architecture.');
}

function regularFile(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || !stat.size)
    throw new Error(`Expected a nonempty regular file: ${path.basename(file)}`);
  return file;
}
const digest = (file) =>
  createHash('sha256')
    .update(readFileSync(regularFile(file)))
    .digest('hex');
function copy(source, destination) {
  if (existsSync(destination))
    throw new Error(`Refusing to overwrite ${path.basename(destination)}.`);
  copyFileSync(regularFile(source), destination);
}
export function checksums(directory, files, filename = 'SHA256SUMS.txt') {
  const body =
    files
      .toSorted()
      .map((name) => `${digest(path.join(directory, name))}  ${name}`)
      .join('\n') + '\n';
  writeFileSync(path.join(directory, filename), body, { flag: 'wx' });
  return body;
}
function peX64(file) {
  const bytes = readFileSync(regularFile(file));
  const offset = bytes.length >= 64 ? bytes.readUInt32LE(60) : 0;
  if (
    bytes.subarray(0, 2).toString() !== 'MZ' ||
    offset + 6 > bytes.length ||
    bytes.subarray(offset, offset + 4).toString() !== 'PE\0\0' ||
    bytes.readUInt16LE(offset + 4) !== 0x8664
  )
    throw new Error('The standalone Windows executable must be a valid x64 PE binary.');
}

export function packagePlatform({
  root,
  source,
  output,
  version,
  platform,
  architecture,
  archive = execFileSync,
  updater = false,
}) {
  const names = platformAssets(version, platform, architecture, updater);
  mkdirSync(output, { recursive: true });
  if (readdirSync(output).length) throw new Error('Distribution output must be empty.');
  if (platform === 'windows') {
    peX64(path.join(source, 'repo-creator.exe'));
    assertNoPrivateBuildPaths(readFileSync(path.join(source, 'repo-creator.exe')), { root });
    copy(
      path.join(source, 'bundle', 'nsis', `Repo Creator_${version}_x64-setup.exe`),
      path.join(output, names[0]),
    );
    copy(
      path.join(source, 'bundle', 'msi', `Repo Creator_${version}_x64_en-US.msi`),
      path.join(output, names[1]),
    );
    if (updater) {
      copy(
        path.join(source, 'bundle', 'nsis', `Repo Creator_${version}_x64-setup.exe.sig`),
        path.join(output, names[3]),
      );
      copy(
        path.join(source, 'bundle', 'msi', `Repo Creator_${version}_x64_en-US.msi.sig`),
        path.join(output, names[4]),
      );
    }
    // Build a portable archive with required notices, rather than distribute a bare executable.
    const portable = path.join(output, 'portable');
    mkdirSync(portable);
    copy(path.join(source, 'repo-creator.exe'), path.join(portable, 'Repo Creator.exe'));
    copy(path.join(root, 'LICENSE'), path.join(portable, 'LICENSE.txt'));
    copy(
      path.join(root, 'THIRD_PARTY_NOTICES.txt'),
      path.join(portable, 'THIRD_PARTY_NOTICES.txt'),
    );
    writeFileSync(
      path.join(portable, 'README.txt'),
      'Repo Creator\n\nExtract all files into one folder, then open Repo Creator.exe.\nWindows x64. Microsoft Edge WebView2 is required. This build is unsigned.\nGit is required for project creation; GitHub CLI is optional for publishing.\nSee https://github.com/DefinitivedCode/RepoCreator for setup and security guidance.\n',
    );
    archive(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        path.join(root, 'scripts', 'archive-portable.ps1'),
        '-Source',
        portable,
        '-Destination',
        path.join(output, names[2]),
      ],
      { stdio: 'inherit', windowsHide: true },
    );
    regularFile(path.join(output, names[2]));
    // The staging directory is excluded explicitly by the upload step; it is never a release asset.
  } else {
    const dmgs = readdirSync(path.join(source, 'dmg')).filter((file) => file.endsWith('.dmg'));
    if (dmgs.length !== 1)
      throw new Error('Expected exactly one DMG from the selected target build.');
    copy(path.join(source, 'dmg', dmgs[0]), path.join(output, names[0]));
    const app = path.join(source, 'macos', 'Repo Creator.app');
    if (!lstatSync(app).isDirectory() || lstatSync(app).isSymbolicLink())
      throw new Error('Missing native application bundle.');
    assertNoPrivateBuildPaths(
      readFileSync(regularFile(path.join(app, 'Contents', 'MacOS', 'repo-creator'))),
      { root },
    );
    if (updater) {
      // Copy Tauri's exact signed archive; rebuilding the tarball would invalidate its signature.
      copy(path.join(source, 'macos', 'Repo Creator.app.tar.gz'), path.join(output, names[1]));
      copy(path.join(source, 'macos', 'Repo Creator.app.tar.gz.sig'), path.join(output, names[2]));
    } else
      archive(
        'tar',
        ['-czf', path.join(output, names[1]), '-C', path.join(source, 'macos'), 'Repo Creator.app'],
        { stdio: 'inherit' },
      );
    regularFile(path.join(output, names[1]));
  }
  const manifest = `SHA256SUMS-${platform}-${architecture}.txt`;
  checksums(output, names, manifest);
  return { names, manifest };
}

export function collectRelease({
  root,
  source,
  output,
  version,
  updater = false,
  publicKey = process.env.REPO_CREATOR_UPDATER_PUBLIC_KEY,
  channel = '',
}) {
  releaseVersion(version);
  // Omitted channel preserves existing manual preparation, including v1.5.2.
  // Explicit future preparation validates immutable tagged notes before writing.
  const reviewedNotes = channel ? reviewedReleaseNotes(root, version, channel) : null;
  const expected = [
    ['windows', 'x64'],
    ['macos', 'arm64'],
    ['macos', 'x64'],
  ].flatMap(([platform, architecture]) => platformAssets(version, platform, architecture, updater));
  const found = new Map();
  const scan = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not release assets.');
      if (entry.isDirectory()) scan(file);
      else {
        if (found.has(entry.name)) throw new Error('Duplicate distribution asset.');
        found.set(entry.name, file);
      }
    }
  };
  scan(source);
  const manifests = [
    'SHA256SUMS-windows-x64.txt',
    'SHA256SUMS-macos-arm64.txt',
    'SHA256SUMS-macos-x64.txt',
  ];
  if (
    found.size !== expected.length + manifests.length ||
    [...found.keys()].some((name) => ![...expected, ...manifests].includes(name))
  )
    throw new Error('The release must contain exactly the three verified platform artifact sets.');
  for (const name of [...expected, ...manifests])
    if (!found.has(name)) throw new Error(`Missing release artifact ${name}.`);
  for (const manifest of manifests) {
    const lines = readFileSync(found.get(manifest), 'utf8').trimEnd().split('\n');
    const group = manifest.slice('SHA256SUMS-'.length, -'.txt'.length);
    const required = expected.filter((name) => name.includes(`-${group}-`));
    const seen = [];
    for (const line of lines) {
      const parsed = /^([a-f0-9]{64})  ([A-Za-z0-9.-]+)$/.exec(line);
      if (
        !parsed ||
        !required.includes(parsed[2]) ||
        seen.includes(parsed[2]) ||
        digest(found.get(parsed[2])) !== parsed[1]
      )
        throw new Error('Distribution checksum verification failed.');
      seen.push(parsed[2]);
    }
    if (seen.length !== required.length) throw new Error('Incomplete platform checksum manifest.');
  }
  mkdirSync(output, { recursive: true });
  if (readdirSync(output).length) throw new Error('Release output must be empty.');
  for (const name of expected) copy(found.get(name), path.join(output, name));
  copy(path.join(root, 'LICENSE'), path.join(output, 'LICENSE.txt'));
  copy(path.join(root, 'THIRD_PARTY_NOTICES.txt'), path.join(output, 'THIRD_PARTY_NOTICES.txt'));
  if (updater) {
    if (!publicKey)
      throw new Error('REPO_CREATOR_UPDATER_PUBLIC_KEY is required for release verification.');
    const platforms = {};
    for (const [target, file] of [
      ['windows-x86_64-nsis', platformAssets(version, 'windows', 'x64')[0]],
      ['windows-x86_64-msi', platformAssets(version, 'windows', 'x64')[1]],
      ['darwin-aarch64', platformAssets(version, 'macos', 'arm64')[1]],
      ['darwin-x86_64', platformAssets(version, 'macos', 'x64')[1]],
    ]) {
      const signature = readFileSync(path.join(output, `${file}.sig`), 'utf8').trim();
      verifyUpdaterSignature(readFileSync(path.join(output, file)), signature, publicKey, version);
      platforms[target] = {
        url: `https://github.com/DefinitivedCode/RepoCreator/releases/download/v${version}/${file}`,
        signature,
      };
    }
    writeFileSync(
      path.join(output, 'updater.json'),
      JSON.stringify({ version, platforms }, null, 2) + '\n',
      { flag: 'wx' },
    );
  }
  checksums(output, [
    ...expected,
    'LICENSE.txt',
    'THIRD_PARTY_NOTICES.txt',
    ...(updater ? ['updater.json'] : []),
  ]);
  writeFileSync(
    path.join(output, 'RELEASE_NOTES.md'),
    reviewedNotes ??
      `Repo Creator ${version}\n\nChoose the asset for your operating system and processor. Windows installers and the portable archive are unsigned. macOS builds are ad-hoc signed and not notarized; physical Mac launch remains to be verified.\n\nSee the installation and troubleshooting documentation before opening a test build. SHA256SUMS.txt covers all downloadable application assets and notices.\n\nSource and history privacy review, license review and owner publication approval remain required. This workflow prepares a draft only.\n`,
  );
  return expected;
}

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!/^--[a-z-]+$/.test(args[index]) || args[index + 1] === undefined)
      throw new Error('Expected named release-script options.');
    result[args[index].slice(2)] = args[index + 1];
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const flags = options(args);
    const root = path.resolve(flags.root || '.');
    if (command === 'version') {
      const version = checkVersions(root, flags.version, flags.tag);
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
      console.log(version);
    } else if (command === 'notes') {
      reviewedReleaseNotes(root, flags.version, flags.channel);
      console.log(`Verified ${flags.channel} release notes for ${flags.version}.`);
    } else if (command === 'verify-draft') {
      checkDraftMetadata(
        JSON.parse(readFileSync(path.resolve(flags.metadata), 'utf8')),
        flags.version,
        flags.channel,
        readFileSync(path.join(path.resolve(flags.source), 'RELEASE_NOTES.md'), 'utf8'),
      );
      console.log(`Verified unpublished ${flags.channel} draft metadata for ${flags.version}.`);
    } else if (command === 'package') {
      const result = packagePlatform({
        root,
        source: path.resolve(flags.source),
        output: path.resolve(flags.output),
        version: flags.version,
        platform: flags.platform,
        architecture: flags.architecture,
        updater: flags.updater === 'true',
      });
      console.log(`Verified ${result.names.length} application assets and ${result.manifest}.`);
    } else if (command === 'collect') {
      const names = collectRelease({
        root,
        source: path.resolve(flags.source),
        output: path.resolve(flags.output),
        version: flags.version,
        updater: flags.updater === 'true',
        channel: flags.channel || '',
      });
      console.log(
        `Verified all ${names.length} application assets; release bundle and SHA256SUMS.txt are ready.`,
      );
    } else throw new Error('Expected version, notes, verify-draft, package or collect command.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
