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

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function releaseVersion(value) {
  if (!versionPattern.test(value)) throw new Error('Use a stable version such as 1.3.2.');
  return value;
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

export function platformAssets(version, platform, architecture) {
  releaseVersion(version);
  if (platform === 'windows' && architecture === 'x64')
    return ['unsigned-setup.exe', 'unsigned.msi', 'unsigned-portable.zip'].map(
      (suffix) => `Repo-Creator-${version}-windows-x64-${suffix}`,
    );
  if (platform === 'macos' && ['arm64', 'x64'].includes(architecture))
    return ['dmg', 'app.tar.gz'].map(
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
}) {
  const names = platformAssets(version, platform, architecture);
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

export function collectRelease({ root, source, output, version }) {
  releaseVersion(version);
  const expected = [
    ['windows', 'x64'],
    ['macos', 'arm64'],
    ['macos', 'x64'],
  ].flatMap(([platform, architecture]) => platformAssets(version, platform, architecture));
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
  checksums(output, [...expected, 'LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']);
  writeFileSync(
    path.join(output, 'RELEASE_NOTES.md'),
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
    } else if (command === 'package') {
      const result = packagePlatform({
        root,
        source: path.resolve(flags.source),
        output: path.resolve(flags.output),
        version: flags.version,
        platform: flags.platform,
        architecture: flags.architecture,
      });
      console.log(`Verified ${result.names.length} application assets and ${result.manifest}.`);
    } else if (command === 'collect') {
      const names = collectRelease({
        root,
        source: path.resolve(flags.source),
        output: path.resolve(flags.output),
        version: flags.version,
      });
      console.log(
        `Verified all ${names.length} application assets; release bundle and SHA256SUMS.txt are ready.`,
      );
    } else throw new Error('Expected version, package or collect command.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
