import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

function tmpFile() {
  return path.join(os.tmpdir(), `crypto-watchlist-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

async function loadPlugin(watchlistPath) {
  vi.stubEnv('CRYPTO_WATCHLIST_PATH', watchlistPath);
  vi.resetModules();
  const { resetClient } = await import('../client.js');
  resetClient();
  return import('../index.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('tools export', () => {
  it('exports tools and tiles arrays', async () => {
    const mod = await loadPlugin(tmpFile());
    expect(Array.isArray(mod.tools)).toBe(true);
    expect(Array.isArray(mod.tiles)).toBe(true);
    expect(mod.tools.map(t => t.name)).toEqual([
      'crypto_status',
      'crypto_get_price',
      'crypto_get_market',
      'crypto_list_watchlist',
      'crypto_add_watchlist',
      'crypto_remove_watchlist',
    ]);
    expect(mod.tiles[0].id).toBe('watchlist');
  });

  it('every tool has the Goose tool shape', async () => {
    const mod = await loadPlugin(tmpFile());
    for (const tool of mod.tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(['safe', 'moderate', 'dangerous']).toContain(tool.riskLevel);
      expect(typeof tool.parameters).toBe('object');
      expect(typeof tool.execute).toBe('function');
    }
  });
});

describe('resolve helpers', () => {
  it('maps common tickers and passes through CoinGecko ids', async () => {
    vi.resetModules();
    const { resolveId, resolveIds } = await import('../client.js');
    expect(resolveId('BTC')).toBe('bitcoin');
    expect(resolveId('eth')).toBe('ethereum');
    expect(resolveId('bitcoin')).toBe('bitcoin');
    expect(resolveIds('BTC, ETH, !!!')).toEqual({
      ids: ['bitcoin', 'ethereum'],
      unknown: ['!!!'],
    });
  });
});

describe('watchlist store', () => {
  it('defaults, adds, and removes assets', async () => {
    const file = tmpFile();
    vi.stubEnv('CRYPTO_WATCHLIST_PATH', file);
    vi.resetModules();
    const store = await import('../store.js');
    expect(store.getWatchlist().map(a => a.id)).toEqual(['bitcoin', 'ethereum', 'solana']);

    store.addAsset({ id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' });
    expect(store.getWatchlist().some(a => a.id === 'dogecoin')).toBe(true);

    const result = store.removeAsset('dogecoin');
    expect(result.removed).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
  });
});

describe('price tools with mocked fetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('crypto_get_price returns formatted prices', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        bitcoin: { usd: 70000, usd_24h_change: 1.5, last_updated_at: 1_700_000_000 },
      }),
    });
    const { tools } = await loadPlugin(tmpFile());
    const raw = await tools.find(t => t.name === 'crypto_get_price').execute({ symbols: 'BTC' });
    const body = JSON.parse(raw);
    expect(body.prices[0].id).toBe('bitcoin');
    expect(body.prices[0].price.amount).toBe(70000);
    expect(body.prices[0].change24h.tone).toBe('up');
  });

  it('crypto_status reports connectivity', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ gecko_says: '(V3) To the Moon!' }),
    });
    const { tools } = await loadPlugin(tmpFile());
    const raw = await tools.find(t => t.name === 'crypto_status').execute({});
    const body = JSON.parse(raw);
    expect(body.connected).toBe(true);
    expect(body.provider).toBe('coingecko');
  });

  it('watchlist tile returns table rows', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        bitcoin: { usd: 1, usd_24h_change: -2 },
        ethereum: { usd: 2, usd_24h_change: 3 },
        solana: { usd: 3, usd_24h_change: 0 },
      }),
    });
    const { tiles } = await loadPlugin(tmpFile());
    const payload = await tiles[0].load();
    expect(payload.kind).toBe('table');
    expect(payload.rows).toHaveLength(3);
    expect(payload.rows[0].cells.asset).toMatch(/BTC/);
  });

  it('returns Error: prefix on HTTP failure', async () => {
    fetch.mockResolvedValue({ ok: false, status: 429 });
    const { tools } = await loadPlugin(tmpFile());
    const raw = await tools.find(t => t.name === 'crypto_get_price').execute({ symbols: 'BTC' });
    expect(raw.startsWith('Error:')).toBe(true);
  });
});
