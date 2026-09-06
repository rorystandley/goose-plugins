import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configuration, createService, evaluate } from '../dependabot.js';
import { createClient, GitHubError, repositoryName, pullNumber } from '../client.js';
import { tools } from '../index.js';

const sha = 'a'.repeat(40);
const bot = { login: 'dependabot[bot]', type: 'Bot' };
const repository = { full_name: 'owner/repo', owner: { login: 'owner' }, permissions: { push: true }, allow_squash_merge: true };
function evidence() {
  return { repository: structuredClone(repository),
    pr: { number: 1, user: bot, state: 'open', draft: false, merged: false, commits: 1,
      head: { sha, ref: 'dependabot/npm/example', repo: repository },
      base: { sha: 'b'.repeat(40), repo: repository }, mergeable: true, mergeable_state: 'clean' },
    checks: [{ name: 'test', status: 'completed', conclusion: 'success' }], statuses: [], reviews: [],
    commits: [{ author: bot }] };
}

test('passing verified Dependabot PR is eligible', () => assert.equal(evaluate(evidence()).eligible, true));
for (const [label, mutate] of [
  ['human author', e => { e.pr.user = { login: 'dependabot[bot]', type: 'User' }; }],
  ['human commit', e => { e.commits[0].author = { login: 'human', type: 'User' }; }],
  ['missing commits', e => { e.commits = []; }],
  ['partial commits', e => { e.pr.commits = 2; }],
  ['fork', e => { e.pr.head.repo = { full_name: 'other/repo' }; }],
  ['wrong base repo', e => { e.pr.base.repo = { full_name: 'owner/other' }; }],
  ['non Dependabot branch', e => { e.pr.head.ref = 'feature/fake'; }],
  ['draft', e => { e.pr.draft = true; }],
  ['unknown draft state', e => { delete e.pr.draft; }],
  ['closed', e => { e.pr.state = 'closed'; }],
  ['already merged', e => { e.pr.merged = true; }],
  ['archived', e => { e.repository.archived = true; }],
  ['read only', e => { e.repository.permissions.push = false; }],
  ['unknown mergeability', e => { e.pr.mergeable = null; }],
  ['behind base', e => { e.pr.mergeable_state = 'behind'; }],
  ['branch protection', e => { e.pr.mergeable_state = 'blocked'; }],
  ['invalid SHA', e => { e.pr.head.sha = '../main'; }],
  ['missing CI', e => { e.checks = []; }],
  ['skipped-only CI', e => { e.checks[0].conclusion = 'skipped'; }],
  ['failure', e => { e.checks[0].conclusion = 'failure'; }],
  ['cancelled', e => { e.checks[0].conclusion = 'cancelled'; }],
  ['pending CI', e => { e.checks[0].status = 'queued'; }],
  ['null conclusion', e => { e.checks[0].conclusion = null; }],
  ['legacy status failure', e => { e.statuses = [{ context: 'build', state: 'failure' }]; }],
  ['changes requested', e => { e.reviews = [{ id: 1, user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' }]; }],
]) {
  test(`blocks ${label}`, () => { const e = evidence(); mutate(e); assert.equal(evaluate(e).eligible, false); });
}

test('latest legacy status supersedes a historical failure', () => {
  const e = evidence();
  e.statuses = [{ context: 'build', state: 'success' }, { context: 'build', state: 'failure' }];
  assert.equal(evaluate(e).eligible, true);
});
test('comment does not dismiss changes requested; later approval does', () => {
  const e = evidence();
  e.reviews = ['CHANGES_REQUESTED', 'COMMENTED'].map((state, id) => ({ id, state, user: { login: 'reviewer' } }));
  assert.equal(evaluate(e).eligible, false);
  e.reviews.push({ id: 2, state: 'APPROVED', user: { login: 'reviewer' } });
  assert.equal(evaluate(e).eligible, true);
});
test('one reviewer approval does not clear another reviewer changes request', () => {
  const e = evidence();
  e.reviews = [{ id: 1, state: 'CHANGES_REQUESTED', user: { login: 'a' } }, { id: 2, state: 'APPROVED', user: { login: 'b' } }];
  assert.equal(evaluate(e).eligible, false);
});

function serviceFixture(t, { editEvidence, onRequest, onPaginate, config: overrides } = {}) {
  const e = evidence();
  editEvidence?.(e);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goose-github-test-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const calls = [];
  const client = {
    async request(endpoint, options) {
      calls.push({ endpoint, ...options });
      const override = await onRequest?.(endpoint, options, e, calls);
      if (override !== undefined) return override;
      if (endpoint === '/user') return { login: 'owner' };
      if (endpoint.endsWith('/merge')) return { merged: true, sha: 'c'.repeat(40) };
      if (endpoint.endsWith('/pulls/1')) return structuredClone(e.pr);
      if (endpoint === '/repos/owner/repo') return e.repository;
      throw new Error(`Unexpected request: ${endpoint}`);
    },
    async paginate(endpoint) {
      const override = await onPaginate?.(endpoint, e);
      if (override !== undefined) return override;
      if (endpoint.startsWith('/user/repos')) return [e.repository];
      if (endpoint.includes('/pulls?')) return [e.pr];
      if (endpoint.includes('/check-runs')) return e.checks;
      if (endpoint.endsWith('/statuses')) return e.statuses;
      if (endpoint.endsWith('/reviews')) return e.reviews;
      if (endpoint.endsWith('/commits')) return e.commits;
      if (endpoint.endsWith('/files')) return [];
      throw new Error(`Unexpected pagination: ${endpoint}`);
    },
  };
  const config = { ...configuration({}), autoMerge: true, stateDir, ...overrides };
  return { service: createService({ client, config }), calls, stateDir };
}

test('dry run defaults to no writes even when merge is enabled', async t => {
  const { service, calls, stateDir } = serviceFixture(t);
  const result = await service.sweep();
  assert.equal(result.counts.eligible, 1);
  assert.equal(calls.some(c => c.method), false);
  assert.deepEqual(fs.readdirSync(stateDir), []);
});
test('live sweep merges with exact SHA and records durable evidence', async t => {
  const { service, calls, stateDir } = serviceFixture(t);
  const result = await service.sweep({ dryRun: false });
  assert.equal(result.counts.merged, 1);
  assert.deepEqual(calls.find(c => c.method === 'PUT').body, { sha, merge_method: 'squash' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir, 'latest.json'))).counts.merged, 1);
  const audit = fs.readFileSync(path.join(stateDir, 'audit.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(audit.map(a => a.event), ['merge_attempt', 'merge_result', 'sweep']);
  assert.equal(fs.existsSync(path.join(stateDir, 'maintenance.lock')), false);
});
test('blocked CI is skipped without any mutation', async t => {
  const { service, calls } = serviceFixture(t, { editEvidence: e => { e.checks[0].conclusion = 'failure'; } });
  assert.equal((await service.sweep({ dryRun: false })).counts.skipped, 1);
  assert.equal(calls.some(c => c.method), false);
});
test('disabled configuration cannot be overridden by a tool call', async t => {
  const { service, calls } = serviceFixture(t, { config: { autoMerge: false } });
  await assert.rejects(service.sweep({ dryRun: false }), /disabled/);
  await assert.rejects(service.merge('owner/repo', 1, sha), /disabled/);
  assert.equal(calls.some(c => c.method), false);
});
test('changed inspected head is refused', async t => {
  const { service, calls } = serviceFixture(t);
  const result = await service.merge('owner/repo', 1, 'd'.repeat(40));
  assert.equal(result.status, 'skipped');
  assert.match(result.reasons[0], /Head changed/);
  assert.equal(calls.some(c => c.method), false);
});
for (const change of ['head', 'base', 'draft', 'closed', 'blocked']) {
  test(`final ${change} race prevents merging`, async t => {
    const { service, calls } = serviceFixture(t, { onRequest(endpoint, options, e, calls) {
      if (endpoint.endsWith('/pulls/1') && calls.filter(c => c.endpoint.endsWith('/pulls/1')).length === 2) {
        const pr = structuredClone(e.pr);
        if (['head', 'base'].includes(change)) pr[change].sha = 'e'.repeat(40);
        if (change === 'draft') pr.draft = true;
        if (change === 'closed') pr.state = 'closed';
        if (change === 'blocked') pr.mergeable_state = 'blocked';
        return pr;
      }
    } });
    assert.equal((await service.sweep({ dryRun: false })).counts.skipped, 1);
    assert.equal(calls.some(c => c.method), false);
  });
}
test('unsupported preferred method falls back to a repository-enabled method', async t => {
  const { service, calls } = serviceFixture(t, { editEvidence(e) { e.repository.allow_squash_merge = false; e.repository.allow_rebase_merge = true; } });
  await service.sweep({ dryRun: false });
  assert.equal(calls.find(c => c.method).body.merge_method, 'rebase');
});
test('repository list omits merge settings; live sweep fetches the full repository', async t => {
  const { service, calls } = serviceFixture(t, { onPaginate(endpoint, e) {
    if (endpoint.startsWith('/user/repos')) {
      const { allow_squash_merge, ...listed } = e.repository;
      return [listed];
    }
  } });
  assert.equal((await service.sweep({ dryRun: false })).counts.merged, 1);
  assert.ok(calls.some(c => c.endpoint === '/repos/owner/repo'));
});
test('unknown mergeability gets one bounded re-read after collecting evidence', async t => {
  const { service, calls } = serviceFixture(t, { onRequest(endpoint, options, e, calls) {
    if (endpoint.endsWith('/pulls/1') && calls.filter(c => c.endpoint.endsWith('/pulls/1')).length === 1) {
      return { ...structuredClone(e.pr), mergeable: null, mergeable_state: 'unknown' };
    }
  } });
  assert.equal((await service.sweep()).counts.eligible, 1);
  assert.equal(calls.filter(c => c.endpoint.endsWith('/pulls/1')).length, 2);
});
test('head changed during mergeability computation cannot reuse old CI evidence', async t => {
  const { service, calls } = serviceFixture(t, { onRequest(endpoint, options, e, calls) {
    if (!endpoint.endsWith('/pulls/1')) return;
    const pr = structuredClone(e.pr);
    if (calls.filter(c => c.endpoint.endsWith('/pulls/1')).length === 1) {
      pr.mergeable = null; pr.mergeable_state = 'unknown';
    } else pr.head.sha = 'f'.repeat(40);
    return pr;
  } });
  assert.equal((await service.sweep({ dryRun: false })).counts.skipped, 1);
  assert.equal(calls.some(c => c.method), false);
});
test('unconfirmed or failed merge never reports success or retries the write', async t => {
  for (const behavior of ['not-merged', 'conflict', 'timeout']) {
    const { service, calls } = serviceFixture(t, { onRequest(endpoint) {
      if (!endpoint.endsWith('/merge')) return;
      if (behavior === 'not-merged') return { merged: false };
      throw new GitHubError(behavior, behavior === 'conflict' ? 409 : 0);
    } });
    const result = await service.sweep({ dryRun: false });
    assert.equal(result.counts.merged, 0);
    assert.equal(calls.filter(c => c.method === 'PUT').length, 1);
    assert.equal(result.counts.errors, behavior === 'not-merged' ? 0 : 1);
  }
});
test('rate limiting stops the sweep and remains visible in the report', async t => {
  const { service, calls } = serviceFixture(t, { onRequest(endpoint) {
    if (endpoint.endsWith('/pulls/1')) throw new GitHubError('rate limited', 429, true);
  } });
  const result = await service.sweep({ dryRun: false });
  assert.equal(result.status, 'completed_with_errors');
  assert.match(result.errors[0].error, /rate limited/);
  assert.equal(calls.some(c => c.method), false);
});
test('scope excludes collaborator and archived repositories', async t => {
  const { service } = serviceFixture(t, { onPaginate(endpoint, e) {
    if (endpoint.startsWith('/user/repos')) return [e.repository,
      { ...e.repository, full_name: 'other/repo', owner: { login: 'other' } },
      { ...e.repository, full_name: 'owner/old', archived: true }];
  } });
  assert.deepEqual((await service.repositories()).map(r => r.name), ['owner/repo']);
  await assert.rejects(service.inspect('other/repo', 1), /outside/);
});
test('configured owner prevents accidentally using another GitHub account', async t => {
  const { service } = serviceFixture(t, { config: { owner: 'somebody-else' } });
  await assert.rejects(service.repositories(), /does not match/);
});
test('concurrent maintenance is refused and existing lock preserved', async t => {
  const { service, stateDir, calls } = serviceFixture(t);
  const lock = path.join(stateDir, 'maintenance.lock');
  fs.writeFileSync(lock, 'existing worker');
  await assert.rejects(service.sweep({ dryRun: false }), /locked/);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'existing worker');
  assert.equal(calls.length, 0);
});
test('input validation rejects path traversal and ambiguous writes', () => {
  for (const repo of ['../etc', 'a/..', 'a/b/c', '//evil', 'a/b?token=x']) assert.throws(() => repositoryName(repo));
  for (const number of [0, -1, '1', 1.2]) assert.throws(() => pullNumber(number));
  assert.throws(() => configuration({ GOOSE_GITHUB_MERGE_METHOD: 'admin' }));
  assert.equal(configuration({}).autoMerge, false);
});

const response = (data, status = 200, headers = {}) => ({ ok: status < 300, status, headers: new Headers(headers), json: async () => data });
test('client paginates beyond 100 records', async () => {
  const urls = [];
  const client = createClient({ env: { GOOSE_GITHUB_TOKEN: 'test' }, fetchImpl: async url => {
    urls.push(String(url));
    return response(url.searchParams.get('page') === '1' ? Array(100).fill({}) : [{}]);
  } });
  assert.equal((await client.paginate('/user/repos')).length, 101);
  assert.match(urls[1], /page=2/);
});
test('incomplete check pagination fails closed', async () => {
  const client = createClient({ env: { GOOSE_GITHUB_TOKEN: 'test' }, fetchImpl: async () => response({ total_count: 2, check_runs: [{}] }) });
  await assert.rejects(client.paginate('/repos/owner/repo/commits/sha/check-runs', 'check_runs'), /incomplete/);
});
test('uses gh keychain with shell-free fixed arguments and hides credentials', async () => {
  let commands = 0;
  const client = createClient({ env: {}, execImpl: async (program, args) => {
    commands++;
    assert.equal(program, 'gh');
    assert.deepEqual(args, ['auth', 'token', '--hostname', 'github.com']);
    return { stdout: 'secret\n' };
  }, fetchImpl: async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer secret');
    assert.equal(options.redirect, 'error');
    return response({ message: 'secret' }, 403);
  } });
  for (let i = 0; i < 2; i++) await assert.rejects(client.request('/user'), error => !error.message.includes('secret') && error.status === 403);
  assert.equal(commands, 1);
  await assert.rejects(client.request('//evil.test/token'), /Invalid/);
});
test('rate-limit error contains retry semantics without response body', async () => {
  const client = createClient({ env: { GOOSE_GITHUB_TOKEN: 'test' }, fetchImpl: async () => response({}, 403, { 'x-ratelimit-remaining': '0' }) });
  await assert.rejects(client.request('/user'), error => error.stopSweep && /Rate limited/.test(error.message));
});
test('mutation timeout is explicitly uncertain and never retried', async () => {
  let calls = 0;
  const client = createClient({ env: { GOOSE_GITHUB_TOKEN: 'test' }, fetchImpl: async () => { calls++; throw new Error('secret transport details'); } });
  await assert.rejects(client.request('/repos/owner/repo/pulls/1/merge', { method: 'PUT', body: { sha } }), /outcome is unknown/);
  assert.equal(calls, 1);
});
test('tool registry exposes separate read and approval-gated write capabilities', () => {
  assert.equal(tools.length, 6);
  assert.equal(new Set(tools.map(t => t.name)).size, 6);
  for (const t of tools) assert.equal(t.riskLevel, /maintain|merge_dependabot/.test(t.name) ? 'dangerous' : 'safe');
});
