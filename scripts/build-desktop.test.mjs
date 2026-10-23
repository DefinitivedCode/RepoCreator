import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertNoPrivateBuildPaths, buildEnvironment, runBuild } from './build-desktop.mjs';

test('shipping brand resources match the approved Keystone masters and platform variants', async () => {
  const read = (name) => readFile(new URL(`../${name}`, import.meta.url));
  const config = JSON.parse(await read('src-tauri/tauri.conf.json'));
  const mac = JSON.parse(await read('src-tauri/tauri.macos.conf.json'));
  const platformIcons = {
    'icons/32x32.png': 'windows-32.png',
    'icons/128x128.png': 'windows-128.png',
    'icons/128x128@2x.png': 'windows-256.png',
    'icons/icon.ico': 'repo-creator.ico',
    'icons/icon.icns': 'repo-creator.icns',
    'icons/macos-128.png': 'macos-128.png',
  };
  assert.deepEqual(config.bundle.icon, Object.keys(platformIcons).slice(0, 4));
  assert.equal(config.bundle.windows.nsis.installerIcon, 'icons/icon.ico');
  assert.equal(config.bundle.windows.nsis.uninstallerIcon, 'icons/icon.ico');
  assert.deepEqual(mac.bundle.icon, ['icons/icon.icns', 'icons/macos-128.png']);
  for (const [destination, source] of Object.entries(platformIcons)) {
    assert.deepEqual(
      await read(`src-tauri/${destination}`),
      await read(`docs/branding/builder/icons/${source}`),
      destination,
    );
  }
  for (const [destination, source] of [
    ['app-icon.svg', 'masters/app-icon-windows.svg'],
    ['public/favicon.ico', 'icons/favicon.ico'],
    ['src/assets/branding/mark-colour-light.svg', 'masters/mark-colour-light.svg'],
    ['src/assets/branding/mark-colour-dark.svg', 'masters/mark-colour-dark.svg'],
  ]) {
    assert.deepEqual(await read(destination), await read(`docs/branding/builder/${source}`));
  }
  const ico = await read('src-tauri/icons/icon.ico');
  assert.equal(ico.readUInt16LE(2), 1);
  assert.deepEqual(
    Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico[6 + index * 16] || 256),
    [16, 24, 32, 48, 64, 128, 256],
  );
});

const settings = { root: 'C:\\Build User\\Repo', home: 'C:\\Build User', platform: 'win32' };
test('encoded Rust flags preserve custom arguments and safely remap spaced Windows paths', () => {
  const environment = {
    KEEP: 'value',
    CARGO_ENCODED_RUSTFLAGS: '-C\u001ftarget-cpu=generic',
    CARGO_HOME: 'D:\\Cargo Home',
    RUSTUP_HOME: 'D:\\Rust Home',
  };
  const result = buildEnvironment(environment, settings);
  const flags = result.CARGO_ENCODED_RUSTFLAGS.split('\u001f');
  assert.deepEqual(flags.slice(0, 2), ['-C', 'target-cpu=generic']);
  assert.ok(flags.includes('--remap-path-prefix=C:\\Build User=/build/home'));
  assert.ok(flags.includes('--remap-path-prefix=C:/Build User/Repo=/build/source'));
  assert.ok(flags.includes('--remap-path-prefix=D:\\Cargo Home=/build/cargo'));
  assert.ok(flags.includes('--remap-path-prefix=D:\\Rust Home=/build/rustup'));
  assert.equal(result.KEEP, 'value');
  assert.equal(environment.CARGO_ENCODED_RUSTFLAGS, '-C\u001ftarget-cpu=generic');
});
test('ambiguous plain flags fail clearly without silently discarding user configuration', () => {
  assert.throws(
    () => buildEnvironment({ RUSTFLAGS: '-C opt-level=2' }, settings),
    /CARGO_ENCODED_RUSTFLAGS/,
  );
  assert.throws(
    () => buildEnvironment({}, { ...settings, home: 'C:\\Ambiguous=Home' }),
    /delimiter/,
  );
});

test('preconfigured CI remaps keep the same compiler fingerprint when the wrapper runs', () => {
  for (const platformSettings of [
    settings,
    { root: '/Users/builder/source', home: '/Users/builder', platform: 'darwin' },
  ]) {
    const environment = buildEnvironment(
      { CARGO_ENCODED_RUSTFLAGS: '-C\u001ftarget-cpu=generic' },
      platformSettings,
    );
    let invocation;
    runBuild(['--ci', '--debug', '--no-bundle'], {
      ...platformSettings,
      environment,
      execute: (...args) => {
        invocation = args;
        return { status: 0 };
      },
    });
    assert.equal(invocation[2].env.CARGO_ENCODED_RUSTFLAGS, environment.CARGO_ENCODED_RUSTFLAGS);
    assert.ok(environment.CARGO_ENCODED_RUSTFLAGS.startsWith('-C\u001ftarget-cpu=generic\u001f'));
  }
});
test('build wrapper forwards Tauri arguments without a shell and propagates failure', () => {
  let invocation;
  const status = runBuild(['--ci', '--target', 'x86_64-pc-windows-msvc'], {
    ...settings,
    environment: {},
    execute: (...args) => {
      invocation = args;
      return { status: 7 };
    },
  });
  assert.equal(status, 7);
  assert.deepEqual(invocation[1].slice(1), ['build', '--ci', '--target', 'x86_64-pc-windows-msvc']);
  assert.equal(invocation[2].shell, false);
  assert.equal(invocation[2].cwd, settings.root);
  assert.ok(invocation[2].env.CARGO_ENCODED_RUSTFLAGS);
});
test('release builds fail closed without keys and signed builds enable updater artifacts', () => {
  assert.throws(
    () =>
      runBuild([], {
        ...settings,
        environment: { REPO_CREATOR_RELEASE_BUILD: 'true' },
        execute: () => assert.fail(),
      }),
    /require/,
  );
  assert.throws(
    () =>
      runBuild([], {
        ...settings,
        environment: { TAURI_SIGNING_PRIVATE_KEY: 'test' },
        execute: () => assert.fail(),
      }),
    /require/,
  );
  let invocation;
  runBuild([], {
    ...settings,
    environment: {
      TAURI_SIGNING_PRIVATE_KEY: 'test-only',
      REPO_CREATOR_UPDATER_PUBLIC_KEY: 'public-test-key',
    },
    execute: (...args) => {
      invocation = args;
      return { status: 0 };
    },
  });
  const config = JSON.parse(invocation[1].at(-1));
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.equal(config.plugins.updater.pubkey, 'public-test-key');
  assert.ok(!invocation[1].join().includes('test-only'));
});
test('distribution scan rejects UTF-8 and UTF-16 local paths without reporting their contents', () => {
  for (const value of ['C:\\Build User\\.cargo\\source.rs', 'C:/Build User/Repo/src/main.rs']) {
    for (const encoding of ['utf8', 'utf16le']) {
      const bytes = Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(value, encoding)]);
      assert.throws(
        () => assertNoPrivateBuildPaths(bytes, settings),
        (error) => !error.message.includes('Build User') && /local home/.test(error.message),
      );
    }
  }
  assert.doesNotThrow(() =>
    assertNoPrivateBuildPaths(Buffer.from('/build/cargo/source.rs'), settings),
  );
});
test('Mac/Linux paths use the same remapping and specific prefixes follow the home prefix', () => {
  const result = buildEnvironment(
    {},
    { root: '/home/builder/source', home: '/home/builder', platform: 'darwin' },
  );
  const flags = result.CARGO_ENCODED_RUSTFLAGS.split('\u001f');
  assert.ok(flags.includes('--remap-path-prefix=/home/builder=/build/home'));
  assert.ok(
    flags.indexOf('--remap-path-prefix=/home/builder/source=/build/source') >
      flags.indexOf('--remap-path-prefix=/home/builder=/build/home'),
  );
});
