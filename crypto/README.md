# @goose-plugins/crypto

Crypto price tracking for [Goose](https://github.com/rorystandley/goose) — spot prices, market stats, a persisted watchlist, and a command-centre tile.

Uses the [CoinGecko](https://www.coingecko.com/en/api) API. No API key is required for light personal use; set `COINGECKO_API_KEY` if you hit rate limits.

## Setup

From your Goose checkout, with this package in the sibling `goose-plugins` checkout:

```sh
npm install --ignore-scripts ../goose-plugins/crypto
npm run link-plugins
```

Or add to Goose `package.json`:

```json
"@goose-plugins/crypto": "file:../goose-plugins/crypto"
```

Optional env vars:

```dotenv
# Demo or Pro key — raises CoinGecko rate limits
COINGECKO_API_KEY=
# Set to 1 when using a Pro key (pro-api.coingecko.com)
COINGECKO_PRO=0
# Request timeout in ms (default 15000)
COINGECKO_TIMEOUT_MS=15000
# Override watchlist file path (default ./data/crypto-watchlist.json)
CRYPTO_WATCHLIST_PATH=./data/crypto-watchlist.json
```

Restart Goose and `goose-scheduler`. Configuration is lazy: importing the plugin needs no network and no key.

## Command centre

- **Plugins:** tools appear via Goose’s plugin metadata endpoint after restart.
- **Chat:** ask for prices, market stats, or watchlist changes. Tool activity shows in the Chat stream.
- **Tiles:** exports a `watchlist` tile. Once Goose supports plugin tiles, it shows live watchlist prices on the Overview.
- **Missions:** merge `mission.example.json` into `data/missions.json` for a morning price digest.

## Tools

| Tool | Purpose | Risk |
|---|---|---|
| `crypto_status` | Config + CoinGecko connectivity check | safe |
| `crypto_get_price` | Spot price + 24h change for symbols/ids | safe |
| `crypto_get_market` | Price, volume, market cap, rank | safe |
| `crypto_list_watchlist` | Show persisted watchlist | safe |
| `crypto_add_watchlist` | Track an asset | moderate |
| `crypto_remove_watchlist` | Stop tracking an asset | moderate |

Symbols like `BTC` / `ETH` are mapped to CoinGecko ids. You can also pass ids directly (`bitcoin`, `ethereum`).

## Examples

- “What’s BTC and ETH trading at?”
- “Give me market stats for SOL.”
- “Add DOGE to my crypto watchlist.”
- “What’s on my crypto watchlist?”

## Development

```sh
npm ci
npm test
```

Tests mock HTTP; nothing hits CoinGecko live. Publish with the repo’s `crypto-v<semver>` tag workflow when ready.
