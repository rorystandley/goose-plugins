# @goose-plugins/reddit

Reddit plugin for [Goose](https://github.com/rorystandley/goose) — read-only search and retrieval of posts and comments, designed so the LLM can ground every quote against real source text rather than Google snippets.

All tools are `riskLevel: safe`. Write actions (post / comment / vote / follow) are intentionally out of scope for v1.

## Requirements

### Reddit API access

1. Go to <https://www.reddit.com/prefs/apps> and create an app. Choose type **`script`** (personal use).
2. The form demands a **redirect URI** — this plugin never uses it (it authenticates with the client-credentials grant, no browser redirect involved), but the form won't submit without a value. Put `http://localhost:8080` and move on.
3. Copy the **client ID** (the short string shown just under the app name, *not* the app name itself) and the **secret**.
4. Pick a descriptive user agent string. Reddit **requires** this and will reject requests that look generic. Use `goose/1.0 by u/yourname` or similar.

No user password is needed — this plugin uses OAuth2 application-only auth (client credentials grant).

### Environment variables

Add these to Goose's `.env`:

```env
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=goose/1.0 by u/yourname
```

Rate limit: application-only auth gets ~60 requests/minute. The client reads the rate-limit response headers and pauses automatically when the remaining budget drops below 5.

## Installation

```bash
npm install @goose-plugins/reddit
```

Then restart Goose. The plugin is auto-discovered via the `@goose-plugins/*` namespace.

## Tools

| Tool | Description |
|------|-------------|
| `reddit_search` | Search Reddit posts by query. Optionally scope to one subreddit. Supports `sort`, `timeframe`, `limit`, `minScore`, `minComments` for recency / engagement filtering. |
| `reddit_get_post` | Fetch one post plus its top-level comments. The workhorse for grounding — the LLM quotes from the raw text this returns. Accepts a bare ID, `t3_xxx` fullname, or full permalink URL. |
| `reddit_get_comments` | Fetch a deeper comment thread for a post. Returns a flat indented list with labels like `[1.1.1]` so the thread structure is preserved. |
| `reddit_list_subreddit_top` | Top posts from a subreddit over `day` / `week` / `month` / `year` / `all`. |
| `reddit_list_subreddit_new` | Newest posts from a subreddit. Returns a cursor for cross-run pagination. |

Each tool returns a string whose first line is a machine-readable header (IDs, scores, dates) so the LLM can cite it verbatim.

## Usage examples

Ask Goose (via Slack, CLI, or web):

```
Search Reddit for "I wish there was" in r/Entrepreneur over the last month, min score 20
```

```
Fetch reddit post 1qn8pot with its top 10 comments
```

```
What are the top posts in r/selfhosted this week?
```

```
Pull the newest 5 posts from r/LocalLLaMA
```

## Why use this instead of `web_search`?

Without this plugin, Goose reads Reddit through generic web search with a `site:reddit.com` filter. Search engines return titles and 150-character snippets — not enough for the LLM to quote a post accurately, so it fills the gaps. The result is reports that contain invented quotes, stale posts labelled as "hot," and claims that contradict the linked thread.

This plugin gives Goose direct, structured access to Reddit:

- **Full post text**, not snippets — `reddit_get_post` returns the complete selftext plus the top comments, so the LLM quotes from what Reddit actually returned.
- **Real metadata** — score, comment count, created date, subreddit, author — so Goose can filter for recency and engagement instead of trusting a search engine's ranking.
- **Subreddit scoping** — search one community, or list its top/new posts directly, without hoping Google picked the right thread.

If you ask Goose to research a topic on Reddit, summarise a thread, or monitor a subreddit, installing this plugin makes those answers accurate and citable rather than approximate.
