import fs from 'node:fs';
import path from 'node:path';
import { createClient, repositoryName, pullNumber } from './client.js';

const bot = user => user?.login === 'dependabot[bot]' && user?.type === 'Bot';
const sameRepo = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const successful = conclusion => ['success', 'neutral', 'skipped'].includes(conclusion);

export function configuration(env = process.env) {
  const scope = (env.GOOSE_GITHUB_REPOSITORIES || 'owned').trim();
  const repositories = scope === 'owned' ? null : scope.split(',').map(s => repositoryName(s.trim()));
  const method = env.GOOSE_GITHUB_MERGE_METHOD || 'squash';
  if (!['squash', 'merge', 'rebase'].includes(method)) throw new Error('Invalid GOOSE_GITHUB_MERGE_METHOD.');
  return {
    repositories, owner: env.GOOSE_GITHUB_OWNER || null,
    autoMerge: env.GOOSE_GITHUB_AUTO_MERGE === 'true', method,
    stateDir: path.resolve(env.GOOSE_GITHUB_STATE_DIR || 'data/github'),
  };
}

function summary(pr) {
  return { number: pr.number, title: pr.title, url: pr.html_url, author: pr.user?.login,
    state: pr.state, draft: pr.draft, headSha: pr.head?.sha, base: pr.base?.ref };
}

/** Pure policy: every missing or uncertain merge prerequisite blocks the write. */
export function evaluate({ repository, pr, checks, statuses, reviews, commits }) {
  const reasons = [];
  if (repository.archived || repository.disabled || repository.permissions?.push !== true) reasons.push('Repository is archived, disabled, or not writable.');
  if (pr.state !== 'open' || pr.merged) reasons.push('PR is not open.');
  if (pr.draft !== false) reasons.push('PR is a draft or its draft state is unknown.');
  if (!bot(pr.user)) reasons.push('PR author is not the verified Dependabot bot.');
  if (!sameRepo(pr.base?.repo?.full_name, repository.full_name)
      || !sameRepo(pr.head?.repo?.full_name, repository.full_name)
      || !pr.head?.ref?.startsWith('dependabot/')) reasons.push('PR is not a same-repository Dependabot branch.');
  if (!/^[a-f0-9]{40}$/.test(pr.head?.sha || '')) reasons.push('Head commit is unavailable.');
  if (pr.mergeable !== true || pr.mergeable_state !== 'clean') reasons.push(`GitHub merge state is ${pr.mergeable_state || 'unknown'}; waiting for a clean merge.`);
  if (!commits.length || commits.length !== pr.commits || commits.some(c => !bot(c.author))) {
    reasons.push('The complete commit history must be authored by Dependabot.');
  }

  // COMMENTED reviews do not withdraw an earlier CHANGES_REQUESTED decision.
  const decisions = new Map();
  for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) {
      decisions.set(review.user?.login || `unknown-${review.id}`, review.state);
    }
  }
  if ([...decisions.values()].includes('CHANGES_REQUESTED')) reasons.push('A reviewer has requested changes.');

  // Statuses are returned newest first; old failures must not outweigh a rerun.
  const latestStatuses = new Map();
  for (const status of statuses) if (!latestStatuses.has(status.context)) latestStatuses.set(status.context, status);
  const evidence = [
    ...checks.map(c => ({ name: c.name, state: c.status === 'completed' ? c.conclusion : c.status,
      passed: c.status === 'completed' && successful(c.conclusion), success: c.status === 'completed' && c.conclusion === 'success', url: c.html_url })),
    ...[...latestStatuses.values()].map(s => ({ name: s.context, state: s.state,
      passed: s.state === 'success', success: s.state === 'success', url: s.target_url })),
  ];
  if (!evidence.some(c => c.success)) reasons.push('No successful CI check or commit status exists.');
  for (const check of evidence.filter(c => !c.passed)) reasons.push(`Check ${check.name}: ${check.state || 'unknown'}.`);
  return { eligible: reasons.length === 0, reasons, checks: evidence.map(({ passed, success, ...c }) => c) };
}

export function createService({ client = createClient(), config = configuration(), fsImpl = fs } = {}) {
  async function repositories() {
    const user = await client.request('/user');
    if (config.owner && user.login.toLowerCase() !== config.owner.toLowerCase()) {
      throw new Error(`Authenticated account does not match configured owner ${config.owner}.`);
    }
    const repos = config.repositories
      ? await Promise.all(config.repositories.map(name => client.request(`/repos/${name}`)))
      : await client.paginate('/user/repos?affiliation=owner&sort=full_name');
    return repos.filter(repo => !repo.archived && !repo.disabled && repo.permissions?.push === true
      && (config.repositories || sameRepo(repo.owner?.login, user.login)));
  }

  async function scopedRepository(name) {
    repositoryName(name);
    const repo = (await repositories()).find(r => sameRepo(r.full_name, name));
    if (!repo) throw new Error('Repository is outside the configured writable scope.');
    return repo;
  }

  async function pulls(repo, state = 'open') {
    if (!['open', 'closed', 'all'].includes(state)) throw new Error('Invalid PR state.');
    return client.paginate(`/repos/${repo.full_name}/pulls?state=${state}&sort=created&direction=asc`);
  }

  async function inspect(repo, number, includeFiles = false) {
    pullNumber(number);
    const root = `/repos/${repo.full_name}`;
    let pr = await client.request(`${root}/pulls/${number}`);
    if (!/^[a-f0-9]{40}$/.test(pr.head?.sha || '')) throw new Error('PR has no valid head commit.');
    // Only read endpoints derived from validated repository names and commit IDs.
    const [checks, statuses, reviews, commits] = await Promise.all([
      client.paginate(`${root}/commits/${pr.head.sha}/check-runs?filter=latest`, 'check_runs'),
      client.paginate(`${root}/commits/${pr.head.sha}/statuses`),
      client.paginate(`${root}/pulls/${number}/reviews`),
      client.paginate(`${root}/pulls/${number}/commits`),
    ]);
    // The first GET can start GitHub's asynchronous mergeability calculation.
    // Re-read once after collecting evidence instead of deferring a ready PR a full interval.
    let changed = false;
    if (pr.mergeable === null || pr.mergeable_state === 'unknown') {
      const refreshed = await client.request(`${root}/pulls/${number}`);
      changed = refreshed.head?.sha !== pr.head?.sha || refreshed.base?.sha !== pr.base?.sha;
      if (!changed) pr = refreshed;
    }
    const assessment = evaluate({ repository: repo, pr, checks, statuses, reviews, commits });
    if (changed) {
      assessment.eligible = false;
      assessment.reasons.push('PR changed while GitHub calculated mergeability; retry on the next sweep.');
    }
    const result = { repository: repo.full_name, ...summary(pr), body: pr.body,
      baseSha: pr.base?.sha, ...assessment };
    if (includeFiles) {
      const files = await client.paginate(`${root}/pulls/${number}/files`);
      result.files = files.map(f => ({ filename: f.filename, status: f.status, additions: f.additions,
        deletions: f.deletions, patch: f.patch?.slice(0, 12000), patchTruncated: (f.patch?.length || 0) > 12000,
        patchUnavailable: !f.patch }));
      result.filesComplete = files.length === pr.changed_files;
    }
    return result;
  }

  function audit(event) {
    fsImpl.mkdirSync(config.stateDir, { recursive: true });
    fsImpl.appendFileSync(path.join(config.stateDir, 'audit.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { mode: 0o600 });
  }

  async function merge(repo, number, expectedSha) {
    if (!config.autoMerge) throw new Error('Automatic merging is disabled. Set GOOSE_GITHUB_AUTO_MERGE=true to authorize this plugin.');
    // Repository listings omit merge-method settings. Fetch the full, current
    // repository before evaluating a write (also refreshes archive/permission state).
    repo = await client.request(`/repos/${repo.full_name}`);
    // Always gather fresh evidence, even when the caller already inspected this PR.
    const report = await inspect(repo, number);
    const { body, ...assessment } = report;
    if (expectedSha && report.headSha !== expectedSha) {
      return { ...assessment, eligible: false, status: 'skipped', reasons: ['Head changed after inspection; retry on the next sweep.'] };
    }
    if (!report.eligible) return { ...assessment, status: 'skipped' };
    const allowed = { squash: repo.allow_squash_merge, merge: repo.allow_merge_commit, rebase: repo.allow_rebase_merge };
    const method = [config.method, 'squash', 'merge', 'rebase'].find(m => allowed[m] === true);
    if (!method) return { ...assessment, eligible: false, status: 'skipped', reasons: ['No supported merge method is enabled.'] };
    const current = await client.request(`/repos/${repo.full_name}/pulls/${number}`);
    if (current.head?.sha !== report.headSha || current.base?.sha !== report.baseSha
        || current.state !== 'open' || current.draft !== false || current.mergeable !== true
        || current.mergeable_state !== 'clean' || !bot(current.user)) {
      return { ...assessment, eligible: false, status: 'skipped', reasons: ['PR or base changed during inspection; retry on the next sweep.'] };
    }
    audit({ event: 'merge_attempt', repository: repo.full_name, number, headSha: report.headSha, method });
    // GitHub atomically rejects a changed head SHA. Never use an admin bypass or retry a write.
    const response = await client.request(`/repos/${repo.full_name}/pulls/${number}/merge`, {
      method: 'PUT', body: { sha: report.headSha, merge_method: method },
    });
    const result = response?.merged === true
      ? { ...assessment, status: 'merged', mergeSha: response.sha, method }
      : { ...assessment, status: 'skipped', reasons: ['GitHub did not confirm the merge.'] };
    audit({ event: 'merge_result', ...result });
    return result;
  }

  async function locked(action) {
    fsImpl.mkdirSync(config.stateDir, { recursive: true });
    const lock = path.join(config.stateDir, 'maintenance.lock');
    let fd;
    try { fd = fsImpl.openSync(lock, 'wx', 0o600); } catch (error) {
      if (error.code === 'EEXIST') throw new Error('GitHub maintenance is locked. If its worker crashed, inspect audit.jsonl and remove maintenance.lock before resuming.');
      throw error;
    }
    try {
      fsImpl.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      return await action();
    } finally { fsImpl.closeSync(fd); fsImpl.unlinkSync(lock); }
  }

  async function sweep({ dryRun = true } = {}) {
    if (typeof dryRun !== 'boolean') throw new Error('dryRun must be boolean.');
    if (!dryRun && !config.autoMerge) throw new Error('Automatic merging is disabled. Set GOOSE_GITHUB_AUTO_MERGE=true.');
    const run = async () => {
      const report = { startedAt: new Date().toISOString(), dryRun, status: 'completed', repositories: 0, results: [], errors: [] };
      try {
        const repos = await repositories();
        report.repositories = repos.length;
        for (const repo of repos) {
          try {
            const candidates = (await pulls(repo)).filter(pr => bot(pr.user));
            for (const pr of candidates) {
              try {
                const result = dryRun ? await inspect(repo, pr.number) : await merge(repo, pr.number);
                const { body, ...safeResult } = result;
                report.results.push({ ...safeResult, status: result.status || (result.eligible ? 'eligible' : 'skipped') });
              } catch (error) {
                report.errors.push({ repository: repo.full_name, number: pr.number, error: error.message });
                if (error.stopSweep) throw error;
              }
            }
          } catch (error) {
            if (error.stopSweep) throw error;
            report.errors.push({ repository: repo.full_name, error: error.message });
          }
        }
      } catch (error) { report.errors.push({ error: error.message }); }
      report.status = report.errors.length ? 'completed_with_errors' : 'completed';
      report.finishedAt = new Date().toISOString();
      report.counts = { merged: report.results.filter(r => r.status === 'merged').length,
        eligible: report.results.filter(r => r.status === 'eligible').length,
        skipped: report.results.filter(r => r.status === 'skipped').length, errors: report.errors.length };
      if (!dryRun) {
        audit({ event: 'sweep', ...report });
        const temp = path.join(config.stateDir, 'latest.json.tmp');
        fsImpl.writeFileSync(temp, JSON.stringify(report, null, 2), { mode: 0o600 });
        fsImpl.renameSync(temp, path.join(config.stateDir, 'latest.json'));
      }
      return report;
    };
    return dryRun ? run() : locked(run);
  }

  return {
    repositories: async () => (await repositories()).map(r => ({ name: r.full_name, url: r.html_url, defaultBranch: r.default_branch, private: r.private })),
    pulls: async (name, state) => (await pulls(await scopedRepository(name), state)).map(summary),
    inspect: async (name, number) => inspect(await scopedRepository(name), number, true),
    merge: async (name, number, expectedSha) => {
      if (!/^[a-f0-9]{40}$/.test(expectedSha || '')) throw new Error('The inspected head SHA is required.');
      return locked(async () => merge(await scopedRepository(name), pullNumber(number), expectedSha));
    },
    sweep,
  };
}
