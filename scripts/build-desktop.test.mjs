import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoPrivateBuildPaths, buildEnvironment, runBuild } from './build-desktop.mjs';

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
