/**
 * Crypto watchlist store.
 *
 * Persists tracked CoinGecko ids to data/crypto-watchlist.json.
 * Follows the architecture plugin pattern — module-level load, silent
 * write failures, returns copies to prevent external mutation.
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_WATCHLIST = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
];

function storePath() {
  return process.env.CRYPTO_WATCHLIST_PATH
    || path.join(process.cwd(), 'data', 'crypto-watchlist.json');
}

function empty() {
  return { assets: DEFAULT_WATCHLIST.map(a => ({ ...a })) };
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    if (!Array.isArray(parsed?.assets)) return empty();
    return {
      assets: parsed.assets
        .filter(a => a && typeof a.id === 'string')
        .map(a => ({
          id: a.id,
          symbol: typeof a.symbol === 'string' ? a.symbol : a.id.toUpperCase(),
          name: typeof a.name === 'string' ? a.name : a.id,
        })),
    };
  } catch {
    return empty();
  }
}

function save(data) {
  try {
    const file = storePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch { /* silent */ }
}

let store = load();

export function getWatchlist() {
  return store.assets.map(a => ({ ...a }));
}

export function setWatchlist(assets) {
  store = {
    assets: assets.map(a => ({
      id: a.id,
      symbol: a.symbol || a.id.toUpperCase(),
      name: a.name || a.id,
    })),
  };
  save(store);
  return getWatchlist();
}

export function addAsset(asset) {
  if (store.assets.some(a => a.id === asset.id)) {
    store.assets = store.assets.map(a => (a.id === asset.id ? { ...a, ...asset } : a));
  } else {
    store.assets.push({
      id: asset.id,
      symbol: asset.symbol || asset.id.toUpperCase(),
      name: asset.name || asset.id,
    });
  }
  save(store);
  return getWatchlist();
}

export function removeAsset(id) {
  const before = store.assets.length;
  store.assets = store.assets.filter(a => a.id !== id);
  save(store);
  return { removed: before !== store.assets.length, assets: getWatchlist() };
}

/** Test helper — reload from disk / reset in-memory state. */
export function reloadStore() {
  store = load();
  return getWatchlist();
}
