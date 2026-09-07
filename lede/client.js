export class LedeError extends Error {}

export function connectionInfo(env = process.env) {
  const rawBaseUrl = env.LEDE_BASE_URL?.trim();
  const apiKeyConfigured = Boolean(env.LEDE_API_KEY?.trim());
  if (!rawBaseUrl) {
    return { baseUrl: null, configured: false, baseUrlConfigured: false, apiKeyConfigured };
  }
  let url;
  try { url = new URL(rawBaseUrl); }
  catch { throw new LedeError('LEDE_BASE_URL must be an HTTPS origin.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new LedeError('LEDE_BASE_URL must be an HTTPS origin (HTTP is allowed only on loopback). Do not include /api/v1 or credentials.');
  }
  return { baseUrl: url.origin, configured: apiKeyConfigured, baseUrlConfigured: true, apiKeyConfigured };
}

// Lazy configuration: plugin discovery never needs credentials or network access.
export function createClient({ env = process.env, fetchFn = globalThis.fetch } = {}) {
  const { baseUrl, configured } = connectionInfo(env);
  if (!baseUrl) throw new LedeError('Set LEDE_BASE_URL to your Lede app origin, for example https://your-lede.example.com.');
  if (!configured) throw new LedeError('Set LEDE_API_KEY in Goose’s environment to a Lede nrk_ API key, then restart Goose and its scheduler.');
  const token = env.LEDE_API_KEY.trim();
  const timeout = Number(env.LEDE_TIMEOUT_MS || 15000);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000) {
    throw new LedeError('LEDE_TIMEOUT_MS must be an integer between 100 and 120000.');
  }

  return {
    async request(path, { method = 'GET', query = {}, body } = {}) {
      if (!/^\/[a-z0-9/_-]*$/i.test(path)) throw new LedeError('Invalid Lede API path.');
      const url = new URL(`/api/v1${path}`, baseUrl);
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetchFn(url, {
          method, redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok) {
          const hint = {
            401: 'API key is invalid or expired.', 403: 'This account cannot access the resource.',
            404: 'Resource not found (there may be no digest yet).',
            429: 'Rate limited; try again later.',
          }[response.status] || 'Request failed; check the Lede server and API version.';
          // Never echo response bodies, URLs, or low-level errors containing credentials.
          throw new LedeError(`Lede HTTP ${response.status}: ${hint}`);
        }
        if (response.status === 204) return { ok: true };
        try { return await response.json(); }
        catch { throw new LedeError('Lede returned invalid JSON; check that LEDE_BASE_URL points to the app origin.'); }
      } catch (error) {
        if (error instanceof LedeError) throw error;
        if (controller.signal.aborted) throw new LedeError('Lede request timed out. A write may have completed; check its state before retrying.');
        throw new LedeError('Cannot connect to Lede. Check DNS, TLS, LEDE_BASE_URL, and connectivity. A write may have completed; check before retrying.');
      } finally { clearTimeout(timer); }
    },
  };
}
