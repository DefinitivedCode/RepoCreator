import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const separator = '\u001f';

export function buildPaths({
  root = repositoryRoot,
  home = os.homedir(),
  environment = process.env,
  platform = process.platform,
} = {}) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const values = [
    [home, '/build/home'],
    [root, '/build/source'],
    [environment.CARGO_HOME || paths.join(home, '.cargo'), '/build/cargo'],
    [environment.RUSTUP_HOME || paths.join(home, '.rustup'), '/build/rustup'],
  ];
  return values
    .map(([source, target]) => {
      const absolute = paths.resolve(root, source);
      if (absolute.includes(separator) || absolute.includes('='))
        throw new Error('Build paths contain an unsupported remapping delimiter.');
      return [absolute, target];
    })
    .sort(([a], [b]) => a.length - b.length);
}
export function pathSpellings(value, platform = process.platform) {
  return platform === 'win32'
    ? [
        ...new Set([
          value,
          value.replaceAll('\\', '/'),
          `\\\\?\\${value}`,
          `//?/${value.replaceAll('\\', '/')}`,
        ]),
      ]
    : [value];
}
export function buildEnvironment(environment = process.env, settings = {}) {
  if (environment.RUSTFLAGS?.trim())
    throw new Error(
      'Move custom RUSTFLAGS into CARGO_ENCODED_RUSTFLAGS or unset RUSTFLAGS before building; release path remapping must not silently replace flags.',
    );
  const next = { ...environment };
  delete next.RUSTFLAGS;
  const platform = settings.platform || process.platform;
  const flags = buildPaths({ ...settings, environment }).flatMap(([source, target]) =>
    pathSpellings(source, platform).map((spelling) => `--remap-path-prefix=${spelling}=${target}`),
  );
  // CI sets these before Clippy/tests so the desktop build can reuse their dependencies.
  // Append only missing remaps; preserve custom flags and their ordering verbatim.
  const existing = new Set((environment.CARGO_ENCODED_RUSTFLAGS || '').split(separator));
  next.CARGO_ENCODED_RUSTFLAGS = [
    environment.CARGO_ENCODED_RUSTFLAGS,
    ...flags.filter((flag) => !existing.has(flag)),
  ]
    .filter((value) => value !== undefined && value !== '')
    .join(separator);
  return next;
}
export function assertNoPrivateBuildPaths(bytes, settings = {}) {
  const platform = settings.platform || process.platform;
  for (const [source] of buildPaths(settings)) {
    for (const spelling of pathSpellings(source, platform)) {
      if (bytes.includes(Buffer.from(spelling)) || bytes.includes(Buffer.from(spelling, 'utf16le')))
        throw new Error(
          'Build output contains a local home, source or toolchain path. Rebuild through npm run desktop:build before distribution.',
        );
    }
  }
}
export function runBuild(
  args,
  {
    execute = spawnSync,
    environment = process.env,
    root = repositoryRoot,
    home = os.homedir(),
    platform = process.platform,
  } = {},
) {
  const signed = Boolean(environment.TAURI_SIGNING_PRIVATE_KEY);
  if (
    (signed || environment.REPO_CREATOR_RELEASE_BUILD === 'true') &&
    (!signed || !environment.REPO_CREATOR_UPDATER_PUBLIC_KEY?.trim())
  )
    throw new Error(
      'Signed release builds require TAURI_SIGNING_PRIVATE_KEY and REPO_CREATOR_UPDATER_PUBLIC_KEY.',
    );
  const updaterConfig = signed
    ? [
        '--config',
        JSON.stringify({
          bundle: { createUpdaterArtifacts: true },
          plugins: { updater: { pubkey: environment.REPO_CREATOR_UPDATER_PUBLIC_KEY.trim() } },
        }),
      ]
    : [];
  const result = execute(
    process.execPath,
    [
      path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
      'build',
      ...args,
      ...updaterConfig,
    ],
    {
      cwd: root,
      env: buildEnvironment(environment, { root, home, platform }),
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    },
  );
  if (result.error) throw new Error('The local Tauri build process could not start.');
  return result.status ?? 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runBuild(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
