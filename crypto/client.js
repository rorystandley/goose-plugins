/**
 * Lazy CoinGecko client for the crypto plugin.
 *
 * The public API works without a key at modest volume. Set COINGECKO_API_KEY
 * (demo or pro) to raise rate limits. Configuration is read on first use so
 * Goose can import the plugin during discovery without contacting CoinGecko.
 */

const PUBLIC_BASE = 'https://api.coingecko.com/api/v3';
const PRO_BASE = 'https://pro-api.coingecko.com/api/v3';

export class CryptoError extends Error {}

/** Common ticker → CoinGecko id map for fast resolution without a search round-trip. */
export const SYMBOL_TO_ID = {
  btc: 'bitcoin',
  xbt: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  ada: 'cardano',
  xrp: 'ripple',
  doge: 'dogecoin',
  dot: 'polkadot',
  avax: 'avalanche-2',
  link: 'chainlink',
  matic: 'matic-network',
  pol: 'polygon-ecosystem-token',
  atom: 'cosmos',
  near: 'near',
  apt: 'aptos',
  arb: 'arbitrum',
  op: 'optimism',
  sui: 'sui',
  ton: 'the-open-network',
  trx: 'tron',
  bnb: 'binancecoin',
  ltc: 'litecoin',
  bch: 'bitcoin-cash',
  uni: 'uniswap',
  aave: 'aave',
  mkr: 'maker',
  pepe: 'pepe',
  shib: 'shiba-inu',
};

export function connectionInfo(env = process.env) {
  const apiKey = env.COINGECKO_API_KEY?.trim() || '';
  const pro = env.COINGECKO_PRO === 'true' || env.COINGECKO_PRO === '1';
  return {
    configured: true,
    apiKeyConfigured: Boolean(apiKey),
    pro,
    baseUrl: pro ? PRO_BASE : PUBLIC_BASE,
  };
}

function timeoutMs(env) {
  const raw = Number(env.COINGECKO_TIMEOUT_MS || 15000);
  if (!Number.isInteger(raw) || raw < 100 || raw > 120000) {
    throw new CryptoError('COINGECKO_TIMEOUT_MS must be an integer between 100 and 120000.');
  }
  return raw;
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, fetchFn?: typeof fetch }} [options]
 */
export function createClient({ env = process.env, fetchFn = globalThis.fetch } = {}) {
  const info = connectionInfo(env);
  const apiKey = env.COINGECKO_API_KEY?.trim() || '';
  const timeout = timeoutMs(env);

  return {
    info,
    async request(path, query = {}) {
      if (!/^\/[a-z0-9/_-]*$/i.test(path)) throw new CryptoError('Invalid CoinGecko API path.');
      const url = new URL(`${info.baseUrl}${path}`);
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
      const headers = { Accept: 'application/json' };
      if (apiKey) {
        headers[info.pro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'] = apiKey;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetchFn(url, {
          method: 'GET',
          redirect: 'error',
          signal: controller.signal,
          headers,
        });
        if (!response.ok) {
          const hint = {
            401: 'API key is invalid.',
            403: 'API key is not allowed for this endpoint.',
            429: 'Rate limited by CoinGecko — wait and retry, or set COINGECKO_API_KEY.',
            404: 'Asset not found.',
          }[response.status] || 'Request failed; check CoinGecko status and API version.';
          throw new CryptoError(`CoinGecko HTTP ${response.status}: ${hint}`);
        }
        try {
          return await response.json();
        } catch {
          throw new CryptoError('CoinGecko returned invalid JSON.');
        }
      } catch (error) {
        if (error instanceof CryptoError) throw error;
        if (controller.signal.aborted) throw new CryptoError('CoinGecko request timed out.');
        throw new CryptoError('Cannot reach CoinGecko. Check DNS, TLS, and connectivity.');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

let _client = null;

export function getClient(options) {
  if (options) return createClient(options);
  if (!_client) _client = createClient();
  return _client;
}

/** Reset singleton — used by tests. */
export function resetClient() {
  _client = null;
}

/**
 * Resolve a user-supplied symbol or CoinGecko id to a CoinGecko id.
 * Prefers the local symbol map, then treats the input as an id if it looks like one.
 */
export function resolveId(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (SYMBOL_TO_ID[lower]) return SYMBOL_TO_ID[lower];
  // CoinGecko ids are lowercase kebab-case; allow them through.
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lower)) return lower;
  return null;
}

export function resolveIds(inputs) {
  const list = Array.isArray(inputs) ? inputs : String(inputs || '').split(/[\s,]+/);
  const ids = [];
  const unknown = [];
  for (const item of list) {
    if (!item) continue;
    const id = resolveId(item);
    if (id) ids.push(id);
    else unknown.push(String(item));
  }
  return { ids: [...new Set(ids)], unknown };
}
