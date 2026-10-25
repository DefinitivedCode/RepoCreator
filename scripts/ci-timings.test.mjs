import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { summarizeRun, readRun } from './ci-timings.mjs';

test('timings distinguish queue, dependency scheduling, execution and skipped work', () => {
  const result = summarizeRun(
    { created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:03:00Z' },
    [
      {
        name: 'windows',
        created_at: '2026-10-25T10:00:10Z',
        started_at: '2026-10-25T10:00:30Z',
        completed_at: '2026-10-25T10:02:50Z',
        steps: [
          {
            name: 'test',
            conclusion: 'success',
            started_at: '2026-10-25T10:00:40Z',
            completed_at: '2026-10-25T10:01:40Z',
          },
          { name: 'package', conclusion: 'skipped' },
        ],
      },
    ],
  );
  assert.equal(result.elapsedSeconds, 180);
  assert.equal(result.jobs[0].runnerQueueSeconds, 20);
  assert.equal(result.jobs[0].workflowToJobCreationSeconds, 10);
  assert.equal(result.jobs[0].elapsedSeconds, 140);
  assert.deepEqual(
    result.jobs[0].steps.map((step) => step.seconds),
    [60, null],
  );
  assert.equal(summarizeRun({}, [{}]).jobs[0].runnerQueueSeconds, null);
});

test('timing export paginates jobs and never fetches logs or cache contents', () => {
  const calls = [];
  const result = readRun('example/repo', 123, (program, args) => {
    assert.equal(program, 'gh');
    calls.push(args);
    return JSON.stringify(
      calls.length === 1
        ? { id: 123 }
        : [{ jobs: [{ name: 'first' }] }, { jobs: [{ name: 'last' }] }],
    );
  });
  assert.deepEqual(
    result.jobs.map((job) => job.name),
    ['first', 'last'],
  );
  assert.deepEqual(calls, [
    ['api', 'repos/example/repo/actions/runs/123'],
    ['api', 'repos/example/repo/actions/runs/123/jobs?per_page=100', '--paginate', '--slurp'],
  ]);
  assert.throws(() => readRun('invalid', 1));
  assert.throws(() => readRun('example/repo', 'invalid'));
});

test('required windows gate rejects failed, cancelled, skipped and missing children', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/windows.yml', import.meta.url),
    'utf8',
  );
  const gate = workflow.split('\n  windows:\n')[1].split('\n  windows-native:\n')[0];
  assert.match(gate, /needs: \[windows-native, windows-browser\]/);
  assert.match(gate, /if: always\(\)/);
  const script = gate
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
  const bash = process.platform === 'win32' ? pathForGitBash() : 'bash';
  for (const native of ['success', 'failure', 'cancelled', 'skipped', '']) {
    for (const browser of ['success', 'failure', 'cancelled', 'skipped', '']) {
      let success = true;
      try {
        execFileSync(bash, ['-e', '-c', script], {
          env: { ...process.env, NATIVE_RESULT: native, BROWSER_RESULT: browser },
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch {
        success = false;
      }
      assert.equal(success, native === 'success' && browser === 'success', `${native}/${browser}`);
    }
  }
  const nativeJob = workflow.split('\n  windows-native:\n')[1].split('\n  macos:\n')[0];
  const browserJob = workflow.split('\n  windows-browser:\n')[1].split('\n  # Keep')[0];
  assert.match(nativeJob, /cargo clippy .*--locked --all-targets/);
  assert.match(nativeJob, /cargo test .*--locked/);
  assert.match(nativeJob, /Build release executable and installers/);
  assert.match(browserJob, /run: npm run test:ui/);
  assert.doesNotMatch(browserJob, /secrets\.|TAURI_SIGNING/);
});

function pathForGitBash() {
  // Git is already required by this repository's native/browser test fixtures.
  const git = execFileSync('where.exe', ['git.exe'], { encoding: 'utf8', windowsHide: true })
    .trim()
    .split(/\r?\n/)[0];
  return path.join(path.dirname(path.dirname(git)), 'bin', 'bash.exe');
}
