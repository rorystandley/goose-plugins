import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const origin = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status = 0, stopSweep = false) {
    super(message);
    this.status = status;
    this.stopSweep = stopSweep;
  }
}

export function repositoryName(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/.test(value)
      || ['.', '..'].includes(value.split('/')[1])) {
    throw new Error('Repository must be owner/name.');
  }
  return value;
}

export function pullNumber(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('PR number must be a positive integer.');
  return value;
}

export function createClient({ env = process.env, fetchImpl = globalThis.fetch, execImpl = exec } = {}) {
  let tokenPromise;
  async function token() {
    if (!tokenPromise) tokenPromise = (async () => {
      const configured = env.GOOSE_GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN;
      if (configured) return configured;
      try {
        const result = await execImpl(env.GOOSE_GITHUB_GH_PATH || 'gh', ['auth', 'token', '--hostname', 'github.com'],
          { timeout: 10000, maxBuffer: 65536, env });
        if (result.stdout.trim()) return result.stdout.trim();
      } catch { /* Never expose subprocess output or credentials in errors. */ }
      throw new GitHubError('GitHub authentication unavailable. Run gh auth login or set GOOSE_GITHUB_TOKEN.', 401, true);
    })();
    return tokenPromise;
  }

  async function request(endpoint, { method = 'GET', body } = {}) {
    // Only fixed GitHub REST paths are accepted; never follow URLs from PR content.
    if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('\\')) {
      throw new Error('Invalid GitHub API path.');
    }
    const url = new URL(endpoint, origin);
    if (url.origin !== origin) throw new Error('Invalid GitHub API origin.');
    const credential = await token();
    let response;
    try {
      response = await fetchImpl(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${credential}`,
          'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new GitHubError(`GitHub ${method} request failed or timed out${method === 'GET' ? '.' : '; mutation outcome is unknown. Inspect the PR before retrying.'}`);
    }
    if (!response.ok) {
      const limited = response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0'
        || !!response.headers.get('retry-after');
      const hint = limited ? 'Rate limited; wait for the next sweep.'
        : response.status === 401 ? 'Authentication failed.'
        : response.status === 403 ? 'Permission denied or a GitHub policy blocked the request.'
        : response.status === 404 ? 'Resource unavailable; check repository access.'
        : [405, 409, 422].includes(response.status) ? 'PR changed or merge requirements are not satisfied.'
        : 'GitHub request failed.';
      // Do not echo remote response bodies: they can contain secrets or untrusted instructions.
      throw new GitHubError(`GitHub HTTP ${response.status}: ${hint}`, response.status, limited || response.status === 401);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function paginate(endpoint, key) {
    const items = [];
    for (let page = 1; page <= 100; page++) {
      const separator = endpoint.includes('?') ? '&' : '?';
      const data = await request(`${endpoint}${separator}per_page=100&page=${page}`);
      const batch = key ? data[key] : data;
      if (!Array.isArray(batch)) throw new Error('Unexpected GitHub pagination response.');
      items.push(...batch);
      if (batch.length < 100) {
        if (key && Number.isInteger(data.total_count) && items.length < data.total_count) {
          throw new Error('GitHub returned incomplete evidence; refusing to use a partial result.');
        }
        return items;
      }
    }
    throw new Error('GitHub pagination limit reached; refusing to use a partial result.');
  }
  return { request, paginate };
}
