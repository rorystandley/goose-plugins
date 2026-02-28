# @goose-plugins/twitter

Twitter/X plugin for [Goose](https://github.com/rorystandley/goose) — assign a Twitter account to Goose and let it read feeds, search tweets, post, like, retweet, and follow as a normal user would.

## Requirements

### Twitter/X API Access

> **Important:** Most features require the **Basic tier** ($100/month). The free tier supports posting only.

| Tier | Cost | Supported tools |
|------|------|-----------------|
| Free | $0 | `twitter_post_tweet`, `twitter_reply_to_tweet` only |
| Basic | $100/month | All 10 tools |

Sign up at [developer.twitter.com](https://developer.twitter.com) and create an app with **OAuth 1.0a** and **Read and Write** permissions.

### Environment Variables

Add these to Goose's `.env` file:

```env
# OAuth 1.0a credentials (from developer.twitter.com → your app → Keys and Tokens)
TWITTER_API_KEY=your_consumer_key
TWITTER_API_SECRET=your_consumer_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret

# Set to match your API access tier — controls which tools Goose can use
# free  → post and reply only (no read access)
# basic → all tools, read + write [default]
TWITTER_API_TIER=basic
```

| `TWITTER_API_TIER` | Cost | Tools available |
|--------------------|------|-----------------|
| `free` | $0 | `twitter_post_tweet`, `twitter_reply_to_tweet` |
| `basic` (default) | $100/month | All 10 tools |

If `TWITTER_API_TIER` is unset or set to an unrecognised value, all tools are enabled (assumes basic access).

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
