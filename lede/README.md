# @goose-plugins/lede

Connect Goose to your Lede news reader using its authenticated REST API. Includes 14 native Goose tools, relevant news gathering, and examples for the Goose command centre’s Missions and Monitors views. No runtime dependencies; Node 18+.

## Why native REST tools

Lede already serves REST at `/api/v1` and Streamable HTTP MCP at `/mcp`. Both call the same backend services. Goose currently discovers JavaScript `tools` arrays and has no MCP client. A native plugin therefore reuses its existing risk levels, tool activity, command centre plugin discovery, and mission execution without adding a protocol adapter. Lede keeps ownership of subscriptions, reading state, folders, and saved searches. Goose composes the personalised briefing using its configured model.

This plugin does not require changes to Lede, direct database access, browser scraping, or Lede’s paid AI endpoints. MCP remains a good option if Goose gains general MCP support later.

## Setup

From your Goose checkout, with this package in the sibling `goose-plugins` checkout:

```sh
npm install --ignore-scripts ../goose-plugins/lede
npm run plugins:link
```

Add to Goose’s `.env` (or its service environment):

```dotenv
LEDE_BASE_URL=https://lede.rorystandley.co.uk
LEDE_API_KEY=nrk_your_personal_api_key
# Optional request timeout, in milliseconds; default 15000
LEDE_TIMEOUT_MS=15000
```

Use an existing personal Lede API key or create a dedicated key named `Goose` through `POST /api/v1/auth/api-keys` with body `{"name":"Goose"}`, authenticated with your Lede login JWT. The Lede repository’s Postman collection includes the authentication/key requests. The current Settings page documents MCP but does not provide key creation controls. Use the returned `key` value, not `keyPrefix`. Lede keys currently inherit the account’s access; they are not scoped read-only. Never put the key in a mission, prompt, repository file, or command centre URL.

Restart Goose and `goose-scheduler` using your existing service manager. Configuration is lazy: importing the plugin needs no credentials and does not contact Lede. In command centre Chat, ask **“Check my Lede connection.”** `lede_status` verifies authenticated access and returns no key or email address.

`LEDE_BASE_URL` is the origin only, without `/api/v1`. HTTPS is required except for local development at `http://localhost:3000` or a loopback IP. Redirects are refused. HTTP bodies and transport errors are not echoed, and writes are never automatically retried after a timeout or network failure.

## Command centre

- **Plugins:** `@goose-plugins/lede` and its 14 tool descriptions/risk levels appear through Goose’s existing plugin metadata endpoint after restart.
- **Chat:** ask for a briefing, search for a topic, read an article, or explicitly change reading state. Tool activity/results appear in the existing Chat activity stream.
- **Missions:** merge the object in `mission.example.json` into the `missions` array in Goose’s `MISSIONS_PATH` (default `data/missions.json`). It is disabled initially but can be run manually from the command centre. The two phases fetch current data and then compose a sourced briefing. Only the read-only briefing tool is available in the gathering phase; composition has no tools. Output is saved to `data/lede/latest-briefing.md`. Mission status and its context’s conversation are visible in Missions and Memory. Set `enabled: true` only when you want the example’s daily 08:00 Europe/London schedule, then restart the scheduler. Add topics to the gathering prompt to customise it.
- **Monitors:** `monitor.example.json` optionally checks Lede’s public readiness endpoint (`/api/health/ready`) using Goose’s existing URL monitor. Merge it into your `monitors` array, adjust the host if necessary, enable it and restart Goose when wanted. This is service health, not personalised news monitoring. Lede saved-search monitors are interest metadata, not Goose monitor registrations.

The examples have no Slack destination and speech is off. A separate Lede page in Goose is unnecessary for this version: the existing command centre already displays the plugin, runs, and conversation results. Lede’s web app remains the full reader interface.

## Examples

- “Give me a Lede briefing using my saved searches and folders.”
- “What has arrived in my Lede feeds in the last 48 hours about AI and software engineering?”
- “Find articles about Kubernetes, read the most relevant one, and explain its main points with a source link.”
- “Show my starred Lede articles.”
- “Star that article and mark it read.”
- “Subscribe to this RSS feed in my Technology folder.”

## Tools

| Tool | Purpose | Risk |
|---|---|---|
| `lede_status` | Configuration and authenticated connection check | safe |
| `lede_list_feeds` | Feeds, unread counts and refresh health | safe |
| `lede_list_folders` | Existing categories and IDs | safe |
| `lede_list_saved_searches` | Existing topic preferences and monitor flags | safe |
| `lede_list_articles` | Paginated articles with feed/folder/state filters | safe |
| `lede_search_articles` | Full-text search across subscriptions | safe |
| `lede_get_article` | Plain-text article content, with chunk pagination | safe |
| `lede_get_briefing` | Recent relevant unread articles with selection reasons | safe |
| `lede_get_digest` | Latest existing digest, with its creation time | safe |
| `lede_set_read_state` | Mark explicit article IDs read or unread | moderate |
| `lede_set_star` | Star or unstar | moderate |
| `lede_set_archived` | Archive or restore | moderate |
| `lede_subscribe_feed` | Subscribe to a feed, optionally in a folder | moderate |
| `lede_refresh_feed` | Refresh one subscribed feed | moderate |

Goose automatically executes `moderate` tools and logs them. Tool descriptions reserve state changes for explicit user requests. Briefing retrieval itself only performs GET requests, does not mark anything read or delivered, and does not build a paid Lede digest. Goose’s own model costs still apply when composing prose.

## Relevance and coverage

The briefing defaults to a 24-hour **arrival** window and 10 stories. It scans up to 300 unread, unarchived articles ordered by `createdAt`, then applies the time window locally. It scores starred stories (+10), each explicit topic keyword match (+6), and each saved-search keyword match (+4), then breaks ties by newest arrival. Feed folders label the selected stories; `folderId` can restrict the input. Canonical URL duplicates and common tracking parameters are collapsed.

Saved searches provide lightweight keyword signals, not exact execution of PostgreSQL’s stemmed full-text queries. Feed/folder/date/read/starred filters are honoured for scoring. Saved searches with tag filters are skipped with a warning because Lede’s article listing returns empty tags. Explicit topics boost ranking, rather than filtering out all other stories. The result explains each selection and includes `scanned`, `scanTruncated`, `omittedFromBriefing`, and warnings. It reads at most 500 feed metadata records and warns if that bound is reached. An empty collection is reported as empty; API failures are returned as `Error:` so Goose’s execution engine can recognise failure.

The inspected Lede implementation currently accepts date/tag fields on article listings without applying them, and accepts scope/date filters on full-text search without applying them. Search also reports a page count as `total`, not a global count. The plugin intentionally exposes only implemented listing filters, exposes search as unfiltered keyword search with pagination, and filters the briefing’s arrival window locally. It does not silently promise unsupported search filters or exhaustive news coverage.

Article excerpts and full text are untrusted source data. The briefing mission explicitly ignores embedded instructions, cites article URLs, and distinguishes old publication dates from newly arrived articles.

## Development

```sh
npm ci
npm test
npm pack --dry-run
```

Tests use mock HTTP responses and fixed fixtures; no live account changes. CI covers Node 18, 20 and 22. Publish with the repository’s existing `lede-v<semver>` tag workflow when ready.
