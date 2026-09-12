/**
 * Crypto plugin for Goose.
 *
 * Tools:
 *   crypto_status          — provider / config check
 *   crypto_get_price       — spot price for one or more assets
 *   crypto_get_market      — market stats (24h change, volume, market cap)
 *   crypto_list_watchlist  — show persisted watchlist
 *   crypto_add_watchlist   — add an asset to the watchlist
 *   crypto_remove_watchlist — remove an asset from the watchlist
 *
 * Tile:
 *   watchlist — command-centre table of watchlist prices (via Goose plugin tiles)
 *
 * Provider: CoinGecko public API (optional COINGECKO_API_KEY for higher limits).
 */

import { CryptoError, getClient, resolveId, resolveIds, connectionInfo } from './client.js';
import { addAsset, getWatchlist, removeAsset, setWatchlist } from './store.js';

function fail(error) {
  const message = error instanceof CryptoError ? error.message : 'Unexpected crypto plugin failure.';
  return `Error: ${message}`;
}

function ok(data) {
  return JSON.stringify(data);
}

function parseSymbols(symbols) {
  if (Array.isArray(symbols)) return symbols;
  if (typeof symbols === 'string') return symbols.split(/[\s,]+/).filter(Boolean);
  return [];
}

async function fetchSimplePrices(ids, vsCurrency = 'usd') {
  const client = getClient();
  const data = await client.request('/simple/price', {
    ids: ids.join(','),
    vs_currencies: vsCurrency,
    include_24hr_change: 'true',
    include_last_updated_at: 'true',
  });
  return data;
}

async function fetchMarkets(ids, vsCurrency = 'usd') {
  const client = getClient();
  const data = await client.request('/coins/markets', {
    vs_currency: vsCurrency,
    ids: ids.join(','),
    price_change_percentage: '24h',
  });
  if (!Array.isArray(data)) throw new CryptoError('Unexpected markets response from CoinGecko.');
  return data;
}

function formatPrice(value, currency) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return { amount: n, currency: currency.toUpperCase(), display: `${n.toLocaleString('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: digits,
  })}` };
}

function formatChange(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  return { percent: n, display: `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`, tone: n > 0 ? 'up' : n < 0 ? 'down' : 'neutral' };
}

const crypto_status = {
  name: 'crypto_status',
  description: 'Check crypto plugin configuration and CoinGecko connectivity without exposing API keys.',
  riskLevel: 'safe',
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => {
    try {
      const info = connectionInfo();
      const client = getClient();
      const ping = await client.request('/ping');
      return ok({
        ...info,
        connected: Boolean(ping?.gecko_says),
        provider: 'coingecko',
        watchlistCount: getWatchlist().length,
        nextStep: info.apiKeyConfigured
          ? null
          : 'Optional: set COINGECKO_API_KEY for higher CoinGecko rate limits.',
      });
    } catch (error) {
      return fail(error);
    }
  },
};

const crypto_get_price = {
  name: 'crypto_get_price',
  description: 'Get the current spot price for one or more crypto assets. Accepts tickers (BTC, ETH) or CoinGecko ids (bitcoin, ethereum). Returns JSON with price, 24h change, and last update time.',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      symbols: {
        type: 'string',
        description: 'Comma-separated tickers or CoinGecko ids, e.g. "BTC,ETH,solana".',
      },
      vsCurrency: {
        type: 'string',
        description: 'Quote currency. Defaults to usd.',
      },
    },
    required: ['symbols'],
  },
  execute: async ({ symbols, vsCurrency = 'usd' } = {}) => {
    try {
      const { ids, unknown } = resolveIds(parseSymbols(symbols));
      if (!ids.length) throw new CryptoError(`Could not resolve any assets from: ${symbols}`);
      const currency = String(vsCurrency || 'usd').toLowerCase();
      const data = await fetchSimplePrices(ids, currency);
      const prices = ids.map(id => {
        const row = data[id];
        if (!row) return { id, error: 'No price returned' };
        return {
          id,
          price: formatPrice(row[currency], currency),
          change24h: formatChange(row[`${currency}_24h_change`]),
          lastUpdatedAt: row.last_updated_at
            ? new Date(row.last_updated_at * 1000).toISOString()
            : null,
        };
      });
      return ok({ vsCurrency: currency, prices, unknown });
    } catch (error) {
      return fail(error);
    }
  },
};

const crypto_get_market = {
  name: 'crypto_get_market',
  description: 'Get market stats for crypto assets: price, 24h change, 24h volume, market cap, and rank. Accepts tickers or CoinGecko ids.',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      symbols: {
        type: 'string',
        description: 'Comma-separated tickers or CoinGecko ids.',
      },
      vsCurrency: {
        type: 'string',
        description: 'Quote currency. Defaults to usd.',
      },
    },
    required: ['symbols'],
  },
  execute: async ({ symbols, vsCurrency = 'usd' } = {}) => {
    try {
      const { ids, unknown } = resolveIds(parseSymbols(symbols));
      if (!ids.length) throw new CryptoError(`Could not resolve any assets from: ${symbols}`);
      const currency = String(vsCurrency || 'usd').toLowerCase();
      const markets = await fetchMarkets(ids, currency);
      const byId = Object.fromEntries(markets.map(m => [m.id, m]));
      const rows = ids.map(id => {
        const m = byId[id];
        if (!m) return { id, error: 'No market data returned' };
        return {
          id: m.id,
          symbol: m.symbol?.toUpperCase(),
          name: m.name,
          rank: m.market_cap_rank,
          price: formatPrice(m.current_price, currency),
          change24h: formatChange(m.price_change_percentage_24h),
          volume24h: m.total_volume,
          marketCap: m.market_cap,
          lastUpdatedAt: m.last_updated || null,
        };
      });
      return ok({ vsCurrency: currency, markets: rows, unknown });
    } catch (error) {
      return fail(error);
    }
  },
};

const crypto_list_watchlist = {
  name: 'crypto_list_watchlist',
  description: 'List assets on the persisted crypto watchlist (used by the command-centre crypto tile and price digests).',
  riskLevel: 'safe',
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => ok({ assets: getWatchlist() }),
};

const crypto_add_watchlist = {
  name: 'crypto_add_watchlist',
  description: 'Add a crypto asset to the watchlist by ticker or CoinGecko id. Use when the user asks to track a coin.',
  riskLevel: 'moderate',
  parameters: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Ticker or CoinGecko id, e.g. "BTC" or "bitcoin".',
      },
    },
    required: ['symbol'],
  },
  execute: async ({ symbol } = {}) => {
    try {
      const id = resolveId(symbol);
      if (!id) throw new CryptoError(`Could not resolve asset: ${symbol}`);
      // Enrich from markets when possible; fall back to id-only.
      let meta = { id, symbol: String(symbol).toUpperCase(), name: id };
      try {
        const [market] = await fetchMarkets([id], 'usd');
        if (market) {
          meta = { id: market.id, symbol: market.symbol?.toUpperCase() || meta.symbol, name: market.name || meta.name };
        }
      } catch { /* keep meta fallback */ }
      const assets = addAsset(meta);
      return ok({ added: meta, assets });
    } catch (error) {
      return fail(error);
    }
  },
};

const crypto_remove_watchlist = {
  name: 'crypto_remove_watchlist',
  description: 'Remove a crypto asset from the watchlist by ticker or CoinGecko id.',
  riskLevel: 'moderate',
  parameters: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Ticker or CoinGecko id to remove.',
      },
    },
    required: ['symbol'],
  },
  execute: async ({ symbol } = {}) => {
    try {
      const id = resolveId(symbol);
      if (!id) throw new CryptoError(`Could not resolve asset: ${symbol}`);
      return ok(removeAsset(id));
    } catch (error) {
      return fail(error);
    }
  },
};

export const tools = [
  crypto_status,
  crypto_get_price,
  crypto_get_market,
  crypto_list_watchlist,
  crypto_add_watchlist,
  crypto_remove_watchlist,
];

/**
 * Command-centre tile — Goose discovers `tiles` and renders them in the web UI.
 * `load()` must return a serialisable payload; keep it fast and side-effect free
 * aside from read-only HTTP + local watchlist reads.
 */
export const tiles = [
  {
    id: 'watchlist',
    title: 'Crypto',
    description: 'Watchlist spot prices via CoinGecko',
    refreshSeconds: 60,
    async load() {
      const assets = getWatchlist();
      if (!assets.length) {
        return {
          kind: 'table',
          columns: [
            { key: 'asset', label: 'Asset' },
            { key: 'price', label: 'Price' },
            { key: 'change', label: '24h' },
          ],
          rows: [],
          emptyMessage: 'Watchlist is empty. Ask Goose to add BTC or ETH.',
          updatedAt: new Date().toISOString(),
        };
      }
      try {
        const ids = assets.map(a => a.id);
        const data = await fetchSimplePrices(ids, 'usd');
        const rows = assets.map(asset => {
          const row = data[asset.id];
          const price = formatPrice(row?.usd, 'usd');
          const change = formatChange(row?.usd_24h_change);
          return {
            tone: change?.tone || 'neutral',
            cells: {
              asset: `${asset.symbol} · ${asset.name}`,
              price: price?.display || '—',
              change: change?.display || '—',
            },
          };
        });
        return {
          kind: 'table',
          columns: [
            { key: 'asset', label: 'Asset' },
            { key: 'price', label: 'Price', align: 'right' },
            { key: 'change', label: '24h', align: 'right' },
          ],
          rows,
          footer: 'Prices from CoinGecko · ask Goose to change the watchlist',
          updatedAt: new Date().toISOString(),
        };
      } catch (error) {
        return {
          kind: 'error',
          message: error instanceof CryptoError ? error.message : 'Failed to load crypto prices.',
          updatedAt: new Date().toISOString(),
        };
      }
    },
  },
];

// Re-export for tests / advanced callers
export { setWatchlist, getWatchlist };
