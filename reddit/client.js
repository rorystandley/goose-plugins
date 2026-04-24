/**
 * Lazy singleton Reddit API client.
 *
 * Uses OAuth2 application-only auth (client credentials grant). No user context.
 * Validates credentials on first use rather than at module load time so that
 * Goose's plugin discovery can import index.js safely without credentials set.
 *
 * Required environment variables:
 *   REDDIT_CLIENT_ID      — from https://www.reddit.com/prefs/apps
 *   REDDIT_CLIENT_SECRET  — from the same app config
 *   REDDIT_USER_AGENT     — required by Reddit; must be descriptive,
 *                           e.g. "goose/1.0 by u/yourname"
 */

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API_BASE = 'https://oauth.reddit.com';
const TOKEN_REFRESH_LEEWAY_MS = 60_000;
const LOW_REMAINING_THRESHOLD = 5;

let _client = null;

export function getClient() {
  if (_client) return _client;

  const required = ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Reddit plugin: missing required environment variables: ${missing.join(', ')}`);
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT;

  const state = {
    token: null,
    expiresAt: 0,
    rateLimit: { remaining: Infinity, reset: 0 },
  };

  async function fetchToken() {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw Object.assign(new Error(`Reddit token request failed: ${body || res.statusText}`), {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
      });
    }
    const json = await res.json();
    state.token = json.access_token;
    state.expiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
  }

  async function ensureToken() {
    if (!state.token || Date.now() >= state.expiresAt - TOKEN_REFRESH_LEEWAY_MS) {
      await fetchToken();
    }
  }

  async function respectRateLimit() {
    if (state.rateLimit.remaining < LOW_REMAINING_THRESHOLD && state.rateLimit.reset > 0) {
      const waitMs = Math.max(0, state.rateLimit.reset * 1000 - Date.now());
      if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
    }
  }

  function updateRateLimit(res) {
    const remaining = parseFloat(res.headers.get('x-ratelimit-remaining'));
    const reset = parseFloat(res.headers.get('x-ratelimit-reset'));
    if (!Number.isNaN(remaining)) state.rateLimit.remaining = remaining;
    if (!Number.isNaN(reset)) state.rateLimit.reset = Math.floor(Date.now() / 1000) + reset;
  }

  async function get(path, params = {}) {
    await respectRateLimit();
    await ensureToken();
    const url = new URL(API_BASE + path);
    url.searchParams.set('raw_json', '1');
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${state.token}`,
        'User-Agent': userAgent,
      },
    });
    updateRateLimit(res);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let message = body || res.statusText;
      try {
        const parsed = JSON.parse(body);
        message = parsed.message || parsed.error || message;
      } catch {}
      throw Object.assign(new Error(message), {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
      });
    }
    return res.json();
  }

  _client = { get };
  return _client;
}

/** Reset the singleton — used by tests to inject a mock client. */
export function _resetClient() {
  _client = null;
}
