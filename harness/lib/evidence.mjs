import { appendFileSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { fingerprint, git, taskContext } from './workflow.mjs';

const dir = process.env.RUN_DIR;
const root = process.cwd();
const [command, ...args] = process.argv.slice(2);
const metadataPath = join(dir, 'summary.json');
const stepsPath = join(dir, 'steps.jsonl');
const eventsPath = join(dir, 'events.jsonl');
function gitValue(...args) {
  try { return git(root, ...args).trim(); } catch { return null; }
}
function writeSummary(value) {
  writeFileSync(`${metadataPath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(`${metadataPath}.tmp`, metadataPath);
}
function readSummary() { return JSON.parse(readFileSync(metadataPath, 'utf8')); }
function steps() { return readFileSync(stepsPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
function event(type, fields = {}) {
  appendFileSync(eventsPath, `${JSON.stringify({ type, at: new Date().toISOString(), ...fields })}\n`);
}
if (command === 'start') {
  const inputs = fingerprint(root);
  const context = process.env.HARNESS_CHANGE ? taskContext(root, process.env.HARNESS_CHANGE) : null;
  if (context && !inputs) throw new Error('Task-bound verification requires a Git checkout');
  if (context) writeFileSync(join(dir, 'context.json'), `${JSON.stringify(context, null, 2)}\n`);
  writeFileSync(stepsPath, '');
  writeFileSync(eventsPath, '');
  writeSummary({
    schemaVersion: 2,
    status: 'running',
    startedAt: new Date().toISOString(),
    revision: gitValue('rev-parse', 'HEAD'),
    dirty: Boolean(gitValue('status', '--porcelain')),
    nodeVersion: process.version,
    inputs,
    task: context ? { change: context.change, id: context.task.id, title: context.task.title, contractDigest: context.contractDigest } : null,
    activeStep: null,
    steps: [],
  });
  event('run-started', { task: context?.task.id ?? null });
} else if (command === 'step-start') {
  const [name] = args;
  event('step-started', { name });
  writeSummary({ ...readSummary(), activeStep: name });
} else if (command === 'step') {
  const [name, code, seconds] = args;
  const step = { name, exitCode: Number(code), durationSeconds: Number(seconds), log: `${name}.log` };
  appendFileSync(stepsPath, `${JSON.stringify(step)}\n`);
  event('step-finished', step);
  writeSummary({ ...readSummary(), activeStep: null, steps: steps() });
} else if (command === 'finish') {
  const summary = readSummary();
  let exitCode = Number(args[0]);
  const endedAt = new Date().toISOString();
  const inputsAfter = fingerprint(root);
  const inputChangedDuringRun = summary.inputs !== null && inputsAfter?.digest !== summary.inputs.digest;
  let taskChangedDuringRun = false;
  if (summary.task) {
    try { taskChangedDuringRun = taskContext(root, summary.task.change, summary.task.id).contractDigest !== summary.task.contractDigest; }
    catch { taskChangedDuringRun = true; }
  }
  if (inputChangedDuringRun || taskChangedDuringRun) {
    console.error('Verification inputs/task changed during the run; rerun the full gate on stable files.');
    if (exitCode === 0) exitCode = 1;
  }
  const status = exitCode === 0 ? 'passed' : [130, 143].includes(exitCode) ? 'interrupted' : 'failed';
  event('run-finished', { status, exitCode, inputChangedDuringRun, taskChangedDuringRun });
  writeSummary({
    ...summary, status, exitCode, endedAt, inputsAfter, inputChangedDuringRun, taskChangedDuringRun,
    durationSeconds: (Date.parse(endedAt) - Date.parse(summary.startedAt)) / 1000,
    steps: steps(),
  });
  // The shell preserves its original failure/signal code; only upgrade a pass.
  process.exitCode = Number(args[0]) === 0 && exitCode !== 0 ? 1 : 0;
} else {
  throw new Error(`Unknown evidence command: ${command}`);
}
