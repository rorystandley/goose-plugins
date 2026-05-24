# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A monorepo of independent npm packages published under `@goose-plugins/*`. Each plugin exposes tools that the [Goose](https://github.com/rorystandley/goose) AI agent runtime auto-discovers and loads. There is no root `package.json` — every plugin directory is a fully self-contained package.

Current plugins: `architecture`, `backup`, `twitter`, `reddit`.

---

## Commands

All commands run from inside the plugin directory (e.g. `cd architecture`):

```bash
npm ci              # install dependencies (use ci, not install, to respect lockfile)
npm test            # run tests once (vitest run)
npm run test:watch  # watch mode during development
```

To run a single test file:
```bash
npx vitest run tests/store.test.js
```

There is no lint script — no linter is configured.

---

## Goose plugin interface

Every plugin exports a named `tools` array from its `index.js`. Each tool object must have:

```js
{
  name: 'snake_case_name',         // string — unique tool identifier
  description: '...',              // string — shown to the agent
  riskLevel: 'safe' | 'moderate' | 'dangerous',
  parameters: {                    // JSON Schema object
    type: 'object',
    properties: { ... },
    required: [...],
  },
  execute: async (params) => string,  // always returns a string, never throws
}
```

**`riskLevel` semantics:**
- `safe` — read-only or local writes; Goose executes without user approval
- `moderate` — reversible social/network actions (e.g. like, retweet)
- `dangerous` — irreversible public actions (e.g. post tweet, follow user); Goose prompts for approval

**`execute` must return a string**, not throw. Catch all errors and return a descriptive string — this is what the agent reads.

---

## Architecture: client singleton pattern

Plugins that call external APIs (`twitter`, `reddit`) follow a consistent pattern:

- `client.js` exports `getClient()` — a lazy singleton that validates env vars on **first call**, not at module load. This lets Goose import `index.js` safely during plugin discovery even when credentials aren't set.
- `_resetClient()` is exported for tests to inject a mock client between test cases.
- `index.js` imports `getClient()` and catches the resulting error in `execute()`, returning it as a string.

---

## Architecture: store pattern (`architecture` plugin)

`store.js` loads from disk at module initialisation, exposes mutators (`addSystem`, `addPerson`, `addRelationship`) that write-through on every call, and `getArchitectureData()` returns deep copies to prevent external mutation. The path is controlled by `ARCHITECTURE_PATH` env var (default: `data/architecture.json` relative to `cwd`).

---

## Testing conventions

Tests use **Vitest** with ESM. The key pattern for module-level state isolation:

```js
async function freshModule(filePath) {
  vi.stubEnv('SOME_ENV_VAR', filePath);
  vi.resetModules();               // forces a fresh module import with new env
  return import('../index.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
```

This is used instead of beforeEach because module-level singletons (store, client) are only initialised once per module instance.

For API clients, mock at the module level before any import:
```js
vi.mock('../client.js', () => ({
  getClient: vi.fn(),
  _resetClient: vi.fn(),
}));
import { getClient } from '../client.js';  // gets the mock
```

Tests use isolated temp directories/files (`os.tmpdir()`) — nothing writes to real `data/` paths.

---

## Adding a new plugin

1. Create `<plugin-name>/` at the repo root with `package.json`, `index.js`, and `tests/`
2. `package.json` must include `"type": "module"` and `"engines": { "node": ">=18.0.0" }`
3. `index.js` must export `export const tools = [...]`
4. In `.github/workflows/ci.yml`: add a filter entry under `changes.steps.filter.with.filters` and copy an existing test job block, updating `name`, `if`, `working-directory`, and `cache-dependency-path`
5. No changes needed to `publish.yml` — it uses the tag prefix to find the directory automatically

---

## Publishing

Publishing is triggered by a git tag in the format `<plugin-name>-v<semver>`:

```bash
git tag architecture-v1.2.0
git push origin architecture-v1.2.0
```

`publish.yml` extracts the package name from the tag, runs `npm test`, stamps the version into `package.json`, and publishes to npm using OIDC trusted publishing (no long-lived tokens). The version in `package.json` in the repo is a placeholder; the tag is the source of truth.

---

## CI

`ci.yml` uses path filtering (via `dorny/paths-filter`) so only the packages with changed files are tested. A change to `architecture/` won't run `twitter/` tests. Each changed package is tested on **Node 18 and Node 20**. Changes to `ci.yml` itself trigger tests for all packages that filter includes it.

---

## Environment variables

| Plugin | Variables | Notes |
|---|---|---|
| `architecture` | `ARCHITECTURE_PATH` | Optional — path to JSON store file |
| `twitter` | `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET` | Required for any API call |
| `twitter` | `TWITTER_API_TIER` | `free` (post/reply only) or `basic` (all tools, default) |
| `backup` | `GOOSE_DATA_DIR`, `GOOSE_BACKUP_DIR`, `GOOSE_BACKUP_KEEP` | All optional with sensible defaults |
| `reddit` | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` | Required; uses OAuth2 app-only auth |

---

## Security

Run `snyk_code_scan` on any new first-party code. If issues are found, fix them and rescan before considering the work complete.
