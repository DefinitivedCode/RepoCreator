// Read-only Actions timing export. No logs, cache contents or credentials are read.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function seconds(start, end) {
  if (!start || !end) return null;
  const duration = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

export function summarizeRun(run, jobs) {
  return {
    id: run.id,
    url: run.html_url,
    event: run.event,
    conclusion: run.conclusion,
    // Includes workflow orchestration and runner waits, matching the run API.
    elapsedSeconds: seconds(run.created_at, run.updated_at),
    jobs: jobs.map((job) => ({
      name: job.name,
      conclusion: job.conclusion,
      elapsedSeconds: seconds(job.started_at, job.completed_at),
      // Missing API timestamps remain unknown, never silently reported as zero.
      runnerQueueSeconds: seconds(job.created_at, job.started_at),
      workflowToJobCreationSeconds: seconds(run.created_at, job.created_at),
      steps: (job.steps ?? []).map((step) => ({
        name: step.name,
        conclusion: step.conclusion,
        seconds: step.conclusion === 'skipped' ? null : seconds(step.started_at, step.completed_at),
      })),
    })),
  };
}

export function readRun(repository, id, execute = execFileSync) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^\d+$/.test(String(id)))
    throw new Error('Supply an owner/repository and numeric run IDs.');
  const read = (endpoint, extra = []) =>
    JSON.parse(
      execute('gh', ['api', endpoint, ...extra], {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
  const endpoint = `repos/${repository}/actions/runs/${id}`;
  const run = read(endpoint);
  const pages = read(`${endpoint}/jobs?per_page=100`, ['--paginate', '--slurp']);
  return summarizeRun(
    run,
    pages.flatMap((page) => page.jobs),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [repository, ...ids] = process.argv.slice(2);
    if (!ids.length)
      throw new Error('Usage: node scripts/ci-timings.mjs owner/repository run-id [...]');
    console.log(
      JSON.stringify(
        ids.map((id) => readRun(repository, id)),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
