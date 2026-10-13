import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const digest = (value) => createHash('sha256').update(value).digest('hex');
export function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}
// Administrative records may change when closing a task; they are not code inputs.
function administrative(file) {
  return file.startsWith('.memsearch/') || file.startsWith('harness/runs/') ||
    file === 'harness/PROGRESS.md' || /^openspec\/changes\/[^/]+\/(tasks|proposal|handoff)\.md$/.test(file);
}
function repositoryFingerprint(root) {
  let files;
  try {
    files = [...new Set(git(root, 'ls-files', '-c', '-o', '--exclude-standard', '-z').split('\0').filter(Boolean))].sort();
  } catch {
    return null;
  }
  const hash = createHash('sha256');
  let count = 0;
  for (const file of files.filter((file) => !administrative(file))) {
    const absolute = join(root, file);
    let stat;
    try { stat = lstatSync(absolute); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Deleted index entries must hash like their post-commit absence.
      continue;
    }
    if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`Unsupported verification input: ${file}`);
    const bytes = stat.isSymbolicLink() ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
    hash.update(JSON.stringify([file, stat.isSymbolicLink() ? 'link' : 'file', Boolean(stat.mode & 0o111), digest(bytes)]));
    count++;
  }
  return { algorithm: 'sha256-v1', digest: hash.digest('hex'), files: count };
}
export function inside(root, path) {
  const base = realpathSync(root);
  const actual = realpathSync(path);
  if (actual !== base && !actual.startsWith(`${base}${sep}`)) throw new Error(`Path outside expected directory: ${path}`);
  return actual;
}
export function parseTasks(markdown) {
  let fence = null;
  const tasks = [];
  for (const [index, line] of markdown.split('\n').entries()) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const match = line.match(/^\s*- \[([ xX])\]\s+(\d+(?:\.\d+)+)\s+(.+)$/);
    if (!match && /^\s*- \[ \]/.test(line)) throw new Error(`Unchecked task needs a numbered ID at line ${index + 1}`);
    if (match && match[3].length > 2000) throw new Error('Task title exceeds 2000 characters; move detail to specs');
    if (match) tasks.push({ id: match[2], title: match[3], done: match[1] !== ' ', line: index + 1 });
  }
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) throw new Error('Duplicate task IDs');
  return tasks;
}
export function taskContext(root, change, taskId) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(change)) throw new Error('Use an active change slug (letters, numbers and hyphens)');
  const dir = inside(join(root, 'openspec/changes'), join(root, 'openspec/changes', change));
  const read = (name) => readFileSync(inside(dir, join(dir, name)), 'utf8');
  const proposal = read('proposal.md');
  const tasks = parseTasks(read('tasks.md'));
  const task = taskId ? tasks.find((item) => item.id === taskId) : tasks.find((item) => !item.done);
  if (!task) throw new Error(taskId ? `Task ${taskId} no longer exists` : `No unchecked numbered task in ${change}`);
  const specs = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) specs.push(relative(root, path));
    }
  }
  if (existsSync(join(dir, 'specs'))) walk(inside(dir, join(dir, 'specs')));
  const progress = existsSync(join(root, 'harness/PROGRESS.md')) ? readFileSync(join(root, 'harness/PROGRESS.md'), 'utf8') : '';
  const recent = progress.split(/(?=^## )/m).filter((section) => section.split('\n', 1)[0].includes(change)).slice(-3);
  return {
    change,
    task,
    contractDigest: digest(JSON.stringify({ id: task.id, title: task.title, proposal: proposal.replace(/^\*\*Status:\*\*.*$/m, '') })),
    proposalExcerpt: proposal.slice(0, 1800),
    sources: ['AGENTS.md', 'harness/GOLDEN_RULES.md', 'openspec/project.md', 'docs/architecture.md', 'docs/harness-design.md',
      `openspec/changes/${change}/proposal.md`, `openspec/changes/${change}/tasks.md`, ...specs.slice(0, 30)],
    specsTruncated: specs.length > 30,
    historyExcerpts: recent.map((section) => section.slice(0, 600)),
    historySource: 'harness/PROGRESS.md',
    verifyCommand: `./harness/verify.sh --change ${change}`,
  };
}
export function inspectRun(root, runPath) {
  const directory = inside(join(root, 'harness/runs'), resolve(root, runPath));
  const report = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
  const reasons = [];
  if (report.schemaVersion !== 2) reasons.push('Legacy or unknown evidence schema; rerun verification');
  if (report.status !== 'passed' || report.exitCode !== 0) reasons.push(`Run is ${report.status ?? 'invalid'}, not passed`);
  if (!Array.isArray(report.steps) || !report.steps.length || report.steps.some((step) => step.exitCode !== 0)) reasons.push('Missing or failing step evidence');
  const current = fingerprint(root);
  if (!current || !report.inputs?.digest || current.digest !== report.inputs.digest || report.inputChangedDuringRun) reasons.push('Verification inputs changed or cannot be fingerprinted');
  if (report.task) {
    try {
      if (taskContext(root, report.task.change, report.task.id).contractDigest !== report.task.contractDigest) reasons.push('Task description or proposal changed');
    } catch (error) { reasons.push(error.message); }
  }
  return {
    run: relative(root, directory),
    status: report.status,
    fresh: reasons.length === 0,
    task: report.task ?? null,
    activeStep: report.activeStep ?? null,
    reasons,
    failedSteps: (report.steps ?? []).filter((step) => step.exitCode !== 0).map((step) => ({ name: step.name, exitCode: step.exitCode, log: `${relative(root, directory)}/${step.log}` })),
    durationSeconds: report.durationSeconds ?? null,
    uiEvidence: 'Not evaluated by this command; follow the task browser scenarios',
  };
}

// Office also depends on its sibling launch/verification scripts. Include them in
// development gate freshness; never include runtime profiles or credentials.
export function fingerprint(root) {
  const base=repositoryFingerprint(root);if(!base)return null;
  const scripts=resolve(root,'../scripts'),hash=createHash('sha256').update(base.digest);
  let count=base.files;
  if(existsSync(scripts))for(const name of readdirSync(scripts).filter(n=>/\.(py|sh)$/.test(n)).sort()){
    hash.update(name);hash.update(readFileSync(join(scripts,name)));count++;
  }
  return {...base,digest:hash.digest('hex'),files:count};
}
