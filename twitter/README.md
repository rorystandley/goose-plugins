# @goose-plugins/twitter

Twitter/X plugin for [Goose](https://github.com/rorystandley/goose) — assign a Twitter account to Goose and let it read feeds, search tweets, post, like, retweet, and follow as a normal user would.

## Requirements

### Twitter/X API Access

Sign up at [developer.x.com](https://developer.x.com) and create an app with **OAuth 1.0a** and **Read and Write** permissions.

> **Important:** All new developer accounts are on the **pay-per-use** pricing model. There are no subscription tiers for new sign-ups. You must add credits via **Billing → Credits** in the developer console before any API calls will succeed. A small balance ($5–$10) covers hundreds of tweets.

> **Read tools** (`twitter_search_tweets`, `twitter_get_timeline`, etc.) require a higher access level than write-only. Set `TWITTER_API_TIER=free` if your account only has write access, to avoid Goose attempting calls that will fail.

| `TWITTER_API_TIER` | Tools available |
|--------------------|-----------------|
| `free` | `twitter_post_tweet`, `twitter_reply_to_tweet` only |
| `basic` (default) | All 10 tools — read + write |

### Environment Variables

Add these to Goose's `.env` file:

```env
# OAuth 1.0a credentials (from developer.x.com → your app → Keys and Tokens)
TWITTER_API_KEY=your_consumer_key
TWITTER_API_SECRET=your_consumer_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret

# Set based on your API access level — controls which tools Goose can use
# free  → post and reply only
# basic → all tools, read + write [default]
TWITTER_API_TIER=basic
```

If `TWITTER_API_TIER` is unset or set to an unrecognised value, all tools are enabled.

### Scheduled missions (SCHEDULER_ALLOW_DANGEROUS)

`twitter_post_tweet`, `twitter_reply_to_tweet`, and `twitter_follow_user` are marked `dangerous` and require human approval before running. In a scheduled/headless mission there is no human in the loop, so you must explicitly opt in:

```env
SCHEDULER_ALLOW_DANGEROUS=true
```

This flag **only affects the scheduler** — when you interact with Goose directly (Slack, CLI, web) dangerous tools still require your approval as normal.

## Installation

```bash
npm install @goose-plugins/twitter
```

Then restart Goose. The plugin is auto-discovered via the `@goose-plugins/*` namespace.

## Tools

### Read tools (run automatically)

| Tool | Description |
|------|-------------|
| `twitter_search_tweets` | Search recent tweets by query (e.g. `"#nodejs"`, `"from:nasa"`) |
| `twitter_get_user` | Get a user's public profile (name, bio, follower/following/tweet counts) |
| `twitter_get_timeline` | Get a user's recent tweets by username |
| `twitter_get_mentions` | Get recent tweets that @-mention the authenticated account |
| `twitter_get_home_feed` | Get the authenticated account's home timeline |

### Write tools — moderate (run automatically with a warning)

| Tool | Description |
|------|-------------|
| `twitter_like_tweet` | Like a tweet by ID |
| `twitter_retweet` | Retweet a tweet by ID |

### Write tools — dangerous (require your approval before running)

| Tool | Description |
|------|-------------|
| `twitter_post_tweet` | Post a new public tweet |
| `twitter_reply_to_tweet` | Reply to a tweet |
| `twitter_follow_user` | Follow a user (modifies social graph) |

## Usage examples

Ask Goose (via Slack, CLI, or web):

```
Search for tweets about Claude AI
```

```
What's on my Twitter home feed?
```

```
Post a tweet saying "Excited to be using Goose AI today!"
```

```
Reply to tweet 1234567890 with "Thanks for sharing!"
```

```
Follow @anthropicai on Twitter
```

## Publishing

Tag-based publishing via CI:

```bash
git tag twitter-v1.0.0
git push origin twitter-v1.0.0
```
