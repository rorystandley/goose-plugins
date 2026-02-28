/**
 * Twitter plugin for Goose.
 *
 * Provides 10 tools for interacting with Twitter/X as an assigned account:
 *   Read  (safe)     : twitter_search_tweets, twitter_get_user, twitter_get_timeline,
 *                      twitter_get_mentions, twitter_get_home_feed
 *   Write (moderate) : twitter_like_tweet, twitter_retweet
 *   Write (dangerous): twitter_post_tweet, twitter_reply_to_tweet, twitter_follow_user
 *
 * Requires Twitter/X Basic tier API access ($100/month) for read tools.
 * Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN,
 * and TWITTER_ACCESS_TOKEN_SECRET in your environment.
 */

import { getClient } from './client.js';

// ---------------------------------------------------------------------------
// Shared error formatter
// ---------------------------------------------------------------------------

function handleError(err) {
  if (err?.code === 429) {
    const ts = err.rateLimit?.reset
      ? new Date(err.rateLimit.reset * 1000).toISOString()
      : 'unknown';
    return `Rate limited by Twitter. Resets at: ${ts}`;
  }
  if (err?.code === 402) {
    const detail = err.data?.detail ?? 'Monthly write credits exhausted.';
    return `Twitter credits depleted (402): ${detail} Upgrade to Basic tier or wait for monthly reset.`;
  }
  if (err?.code && err?.message) return `Twitter API error ${err.code}: ${err.message}`;
  return `Error: ${err?.message ?? String(err)}`;
}

// ---------------------------------------------------------------------------
// Read tools (riskLevel: 'safe')
// ---------------------------------------------------------------------------

const twitter_search_tweets = {
  name: 'twitter_search_tweets',
  description: 'Search recent tweets matching a query. Returns tweet text, author ID, and timestamp. Uses Twitter API v2 recent search (requires Basic tier access).',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Twitter search query, e.g. "#nodejs", "from:elonmusk", or "openai lang:en"',
      },
      maxResults: {
        type: 'number',
        description: 'Number of results to return (10–100). Defaults to 10.',
      },
    },
    required: ['query'],
  },
  execute: async ({ query, maxResults = 10 }) => {
    try {
      const client = getClient();
      const count = Math.min(100, Math.max(10, maxResults));
      const res = await client.v2.search(query, {
        max_results: count,
        'tweet.fields': ['author_id', 'created_at', 'text'],
      });
      const tweets = res.data?.data ?? [];
      if (!tweets.length) return 'No tweets found for that query.';
      return tweets
        .map((t, i) => `[${i + 1}] @${t.author_id} (${t.created_at})\n${t.text}`)
        .join('\n\n');
    } catch (err) {
      return handleError(err);
    }
  },
};

const twitter_get_user = {
  name: 'twitter_get_user',
  description: "Look up a Twitter user's public profile by username. Returns display name, bio, follower count, following count, and tweet count.",
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        description: 'Twitter username without @, e.g. "jack" or "nasa"',
      },
    },
    required: ['username'],
  },
  execute: async ({ username }) => {
    try {
      const client = getClient();
      const res = await client.v2.userByUsername(username, {
        'user.fields': ['name', 'description', 'public_metrics', 'created_at', 'verified'],
      });
      const u = res.data;
      if (!u) return `User @${username} not found.`;
      const m = u.public_metrics ?? {};
      return [
        `@${username} — ${u.name}`,
        u.description || '(no bio)',
        `Followers: ${m.followers_count ?? 'N/A'} | Following: ${m.following_count ?? 'N/A'} | Tweets: ${m.tweet_count ?? 'N/A'}`,
        u.created_at ? `Joined: ${u.created_at.slice(0, 10)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    } catch (err) {
      return handleError(err);
    }
  },
};

const twitter_get_timeline = {
  name: 'twitter_get_timeline',
  description: "Get the most recent tweets from a specific user's timeline by username.",
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        description: 'Twitter username without @',
      },
      maxResults: {
        type: 'number',
        description: 'Number of tweets to return (5–100). Defaults to 10.',
      },
    },
    required: ['username'],
  },
  execute: async ({ username, maxResults = 10 }) => {
    try {
      const client = getClient();
      const userRes = await client.v2.userByUsername(username);
      if (!userRes.data) return `User @${username} not found.`;
      const count = Math.min(100, Math.max(5, maxResults));
      const res = await client.v2.userTimeline(userRes.data.id, {
        max_results: count,
        'tweet.fields': ['created_at', 'text'],
      });
      const tweets = res.data?.data ?? [];
      if (!tweets.length) return `No recent tweets found for @${username}.`;
      return tweets
        .map((t, i) => `[${i + 1}] (${t.created_at?.slice(0, 10) ?? ''})\n${t.text}`)
        .join('\n\n');
    } catch (err) {
      return handleError(err);
    }
  },
};

const twitter_get_mentions = {
  name: 'twitter_get_mentions',
  description: "Fetch recent tweets that @-mention the authenticated account.",
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'number',
        description: 'Number of mentions to return (5–100). Defaults to 20.',
      },
    },
    required: [],
  },
  execute: async ({ maxResults = 20 } = {}) => {
    try {
      const client = getClient();
      const me = await client.v2.me();
      const count = Math.min(100, Math.max(5, maxResults));
      const res = await client.v2.userMentionTimeline(me.data.id, {
        max_results: count,
        'tweet.fields': ['author_id', 'created_at', 'text'],
      });
      const tweets = res.data?.data ?? [];
      if (!tweets.length) return 'No recent mentions found.';
      return tweets
        .map((t, i) => `[${i + 1}] @${t.author_id} (${t.created_at?.slice(0, 10) ?? ''})\n${t.text}`)
        .join('\n\n');
    } catch (err) {
      return handleError(err);
    }
  },
};

const twitter_get_home_feed = {
  name: 'twitter_get_home_feed',
  description: "Fetch the authenticated account's home timeline — tweets from accounts it follows.",
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'number',
        description: 'Number of tweets to return (1–100). Defaults to 20.',
      },
    },
    required: [],
  },
  execute: async ({ maxResults = 20 } = {}) => {
    try {
      const client = getClient();
      const me = await client.v2.me();
      const count = Math.min(100, Math.max(1, maxResults));
      const res = await client.v2.homeTimeline({
        max_results: count,
        'tweet.fields': ['author_id', 'created_at', 'text'],
      });
      const tweets = res.data?.data ?? [];
      if (!tweets.length) return 'Home timeline is empty.';
      return tweets
        .map((t, i) => `[${i + 1}] @${t.author_id} (${t.created_at?.slice(0, 10) ?? ''})\n${t.text}`)
        .join('\n\n');
    } catch (err) {
      return handleError(err);
    }
  },
};

// ---------------------------------------------------------------------------
// Write tools — moderate (auto-executes, reversible social actions)
// ---------------------------------------------------------------------------

const twitter_like_tweet = {
  name: 'twitter_like_tweet',
  description: 'Like a tweet on behalf of the authenticated account.',
  riskLevel: 'moderate',
  parameters: {
    type: 'object',
    properties: {
      tweetId: {
        type: 'string',
        description: 'ID of the tweet to like',
      },
    },
    required: ['tweetId'],
  },
  execute: async ({ tweetId }) => {
    try {
      const client = getClient();
      const me = await client.v2.me();
      await client.v2.like(me.data.id, tweetId);
      return `Liked tweet ${tweetId}.`;
    } catch (err) {
      return handleError(err);
    }
  },
};

const twitter_retweet = {
  name: 'twitter_retweet',
  description: 'Retweet a tweet from the authenticated account.',
  riskLevel: 'moderate',
  parameters: {
    type: 'object',
    properties: {
      tweetId: {
        type: 'string',
        description: 'ID of the tweet to retweet',
      },
    },
    required: ['tweetId'],
  },
  execute: async ({ tweetId }) => {
    try {
      const client = getClient();
      const me = await client.v2.me();
      await client.v2.retweet(me.data.id, tweetId);
      return `Retweeted tweet ${tweetId}.`;
    } catch (err) {
      return handleError(err);
    }
  },
};

// ---------------------------------------------------------------------------
// Write tools — dangerous (requires user approval before executing)
// ---------------------------------------------------------------------------

const twitter_post_tweet = {
  name: 'twitter_post_tweet',
  description: 'Post a new tweet from the authenticated account. The tweet will be publicly visible. Always confirm the text before posting.',
  riskLevel: 'dangerous',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Tweet text (max 280 characters)',
      },
    },
    required: ['text'],
  },
  execute: async ({ text }) => {
    try {
      const client = getClient();
      const res = await client.v2.tweet(text);
      const id = res.data?.id;
      return id
        ? `Tweet posted. ID: ${id} — https://twitter.com/i/web/status/${id}`
        : 'Tweet posted.';
    } catch (err) {
      return handleError(err);
    }
  },
};

const twitter_reply_to_tweet = {
  name: 'twitter_reply_to_tweet',
  description: 'Reply to an existing tweet from the authenticated account. The reply will be publicly visible.',
  riskLevel: 'dangerous',
  parameters: {
    type: 'object',
    properties: {
      tweetId: {
        type: 'string',
        description: 'ID of the tweet to reply to',
      },
      text: {
        type: 'string',
        description: 'Reply text (max 280 characters)',
      },
    },
    required: ['tweetId', 'text'],
  },
  execute: async ({ tweetId, text }) => {
    try {
      const client = getClient();
      const res = await client.v2.reply(text, tweetId);
      const id = res.data?.id;
      return id
        ? `Reply posted. ID: ${id} — https://twitter.com/i/web/status/${id}`
        : 'Reply posted.';
    } catch (err) {
      return handleError(err);
    }
  },
};

const twitter_follow_user = {
  name: 'twitter_follow_user',
  description: 'Follow a user from the authenticated account. This modifies the account\'s social graph and is visible to the followed user.',
  riskLevel: 'dangerous',
  parameters: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        description: 'Twitter username to follow (without @)',
      },
    },
    required: ['username'],
  },
  execute: async ({ username }) => {
    try {
      const client = getClient();
      const me = await client.v2.me();
      const targetRes = await client.v2.userByUsername(username);
      if (!targetRes.data) return `User @${username} not found.`;
      await client.v2.follow(me.data.id, targetRes.data.id);
      return `Now following @${username}.`;
    } catch (err) {
      return handleError(err);
    }
  },
};

// ---------------------------------------------------------------------------
// Plugin export — filtered by TWITTER_API_TIER
//
// Set TWITTER_API_TIER in your environment to match your Twitter/X access level:
//   free  — post and reply only (no read access, $0)
//   basic — all tools (read + write, $100/month) [default]
// ---------------------------------------------------------------------------

const ALL_TOOLS = [
  twitter_search_tweets,
  twitter_get_user,
  twitter_get_timeline,
  twitter_get_mentions,
  twitter_get_home_feed,
  twitter_like_tweet,
  twitter_retweet,
  twitter_post_tweet,
  twitter_reply_to_tweet,
  twitter_follow_user,
];

const TIER_TOOL_NAMES = {
  free:  ['twitter_post_tweet', 'twitter_reply_to_tweet'],
  basic: null, // null = all tools enabled
};

const tier = (process.env.TWITTER_API_TIER ?? 'basic').toLowerCase();
const enabledNames = Object.hasOwn(TIER_TOOL_NAMES, tier) ? TIER_TOOL_NAMES[tier] : null;

export const tools = enabledNames
  ? ALL_TOOLS.filter(t => enabledNames.includes(t.name))
  : ALL_TOOLS;
