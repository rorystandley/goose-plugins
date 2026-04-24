/**
 * Reddit plugin for Goose.
 *
 * Provides 5 read-only tools for searching and retrieving Reddit posts and comments:
 *   reddit_search, reddit_get_post, reddit_get_comments,
 *   reddit_list_subreddit_top, reddit_list_subreddit_new
 *
 * All tools are riskLevel 'safe'. Write actions (post/comment/vote) are intentionally
 * out of scope for v1 — they would require user-context OAuth and a different risk gate.
 *
 * Uses Reddit OAuth2 application-only auth. No user password required.
 * Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and REDDIT_USER_AGENT in your environment.
 */

import { getClient } from './client.js';

// ---------------------------------------------------------------------------
// Shared error formatter
// ---------------------------------------------------------------------------

function handleError(err) {
  if (err?.status === 429) {
    const reset = err.headers?.['x-ratelimit-reset'];
    return `Rate limited by Reddit. Retry after ${reset ?? 'unknown'}s.`;
  }
  if (err?.status === 401 || err?.status === 403) {
    return `Reddit auth error ${err.status}: ${err.message ?? 'check REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_USER_AGENT'}.`;
  }
  if (err?.status === 404) return `Reddit resource not found: ${err.message ?? ''}`;
  if (err?.status >= 500) return `Reddit is having a bad day (${err.status}). Try again shortly.`;
  return `Error: ${err?.message ?? String(err)}`;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const PERMALINK_ID_RE = /\/comments\/([a-z0-9]+)/i;
const BARE_ID_RE = /^(?:t3_)?([a-z0-9]+)$/i;

function normalisePostId(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  const link = trimmed.match(PERMALINK_ID_RE);
  if (link) return link[1];
  const bare = trimmed.match(BARE_ID_RE);
  if (bare) return bare[1];
  return null;
}

function formatDate(createdUtc) {
  if (!createdUtc) return '';
  return new Date(createdUtc * 1000).toISOString().slice(0, 10);
}

function formatPostHeader(p, index) {
  const prefix = index != null ? `[${index}] ` : '';
  return `${prefix}ID: t3_${p.id} | r/${p.subreddit} | u/${p.author} | score ${p.score ?? 0} | ${p.num_comments ?? 0} comments | ${formatDate(p.created_utc)}`;
}

function permalinkUrl(p) {
  return p.permalink ? `https://www.reddit.com${p.permalink}` : (p.url ?? '');
}

function formatSearchResult(p, index, { selftextLimit = 500 } = {}) {
  const lines = [
    formatPostHeader(p, index),
    `Title: ${p.title ?? ''}`,
    `URL: ${permalinkUrl(p)}`,
  ];
  if (p.selftext) {
    const snippet = p.selftext.length > selftextLimit
      ? p.selftext.slice(0, selftextLimit) + '…'
      : p.selftext;
    lines.push(`Selftext (first ${selftextLimit} chars): ${snippet}`);
  } else {
    lines.push('Selftext: (no text content — link or media post)');
  }
  return lines.join('\n');
}

function extractChildren(listing) {
  return listing?.data?.children ?? [];
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const reddit_search = {
  name: 'reddit_search',
  description: 'Search Reddit posts by query. Optionally scope to one subreddit. Returns structured post records with IDs, subreddit, author, score, comment count, date, URL, and a selftext preview — enough to ground direct quotes.',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query. Supports reddit search syntax.',
      },
      subreddit: {
        type: 'string',
        description: "Optional. Restrict to one subreddit, e.g. 'java'.",
      },
      sort: {
        type: 'string',
        enum: ['relevance', 'hot', 'top', 'new', 'comments'],
        description: "Default 'relevance'.",
      },
      timeframe: {
        type: 'string',
        enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
        description: "Default 'month'. Enforces recency.",
      },
      limit: {
        type: 'number',
        description: '1–25. Defaults to 10.',
      },
      minScore: {
        type: 'number',
        description: 'Drop posts with score below this. Defaults to 0.',
      },
      minComments: {
        type: 'number',
        description: 'Drop posts with fewer comments than this. Defaults to 0.',
      },
    },
    required: ['query'],
  },
  execute: async ({ query, subreddit, sort = 'relevance', timeframe = 'month', limit = 10, minScore = 0, minComments = 0 }) => {
    try {
      const client = getClient();
      const count = Math.min(25, Math.max(1, limit));
      const path = subreddit ? `/r/${subreddit}/search` : '/search';
      const params = { q: query, sort, t: timeframe, limit: count };
      if (subreddit) params.restrict_sr = 1;
      const res = await client.get(path, params);
      const posts = extractChildren(res).map(c => c.data);
      const filtered = posts.filter(p => (p.score ?? 0) >= minScore && (p.num_comments ?? 0) >= minComments);
      if (!filtered.length) return 'No Reddit posts matched the query and filters.';
      return filtered.map((p, i) => formatSearchResult(p, i + 1)).join('\n\n');
    } catch (err) {
      return handleError(err);
    }
  },
};

const reddit_get_post = {
  name: 'reddit_get_post',
  description: "Fetch one Reddit post plus its top-level comments. Returns the post's full selftext verbatim and the top comments — the workhorse for grounding quotes against real source text.",
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      postId: {
        type: 'string',
        description: "Reddit post ID (e.g. '1qn8pot') or full permalink URL.",
      },
      commentLimit: {
        type: 'number',
        description: 'Max top-level comments to include. 1–50. Defaults to 10.',
      },
      commentSort: {
        type: 'string',
        enum: ['top', 'new', 'controversial', 'old', 'qa'],
        description: "Default 'top'.",
      },
    },
    required: ['postId'],
  },
  execute: async ({ postId, commentLimit = 10, commentSort = 'top' }) => {
    try {
      const id = normalisePostId(postId);
      if (!id) return `Could not parse Reddit post ID from: ${postId}`;
      const client = getClient();
      const count = Math.min(50, Math.max(1, commentLimit));
      const res = await client.get(`/comments/${id}`, {
        limit: count,
        sort: commentSort,
        depth: 1,
      });
      if (!Array.isArray(res) || res.length < 2) return `Reddit post ${id} not found or returned unexpected data.`;
      const postChildren = extractChildren(res[0]);
      if (!postChildren.length) return `Reddit post ${id} not found.`;
      const p = postChildren[0].data;
      const commentChildren = extractChildren(res[1]).filter(c => c.kind === 't1');
      const lines = [
        'POST',
        formatPostHeader(p),
        `Title: ${p.title ?? ''}`,
        `URL: ${permalinkUrl(p)}`,
        'Selftext:',
        p.selftext ? p.selftext : '(no text content — link or media post)',
        '',
        `TOP COMMENTS (${commentChildren.length})`,
      ];
      commentChildren.forEach((c, i) => {
        const cd = c.data;
        lines.push(`[${i + 1}] u/${cd.author} (score ${cd.score ?? 0}, ${formatDate(cd.created_utc)}): ${cd.body ?? ''}`);
      });
      return lines.join('\n');
    } catch (err) {
      return handleError(err);
    }
  },
};

function walkCommentTree(children, parentLabel, depth, maxDepth, out, budget) {
  if (depth > maxDepth) return;
  let idx = 0;
  for (const child of children) {
    if (budget.remaining <= 0) return;
    if (child.kind !== 't1') continue;
    idx += 1;
    const label = parentLabel ? `${parentLabel}.${idx}` : `${idx}`;
    const cd = child.data;
    const indent = '  '.repeat(depth - 1);
    out.push(`${indent}[${label}] u/${cd.author} (score ${cd.score ?? 0}): ${cd.body ?? ''}`);
    budget.remaining -= 1;
    const replies = cd.replies;
    if (replies && typeof replies === 'object') {
      walkCommentTree(extractChildren(replies), label, depth + 1, maxDepth, out, budget);
    }
  }
}

const reddit_get_comments = {
  name: 'reddit_get_comments',
  description: 'Fetch a deeper comment thread for a Reddit post. Returns a flat indented list so the LLM can follow the thread structure without losing nesting context.',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      postId: {
        type: 'string',
        description: 'Post ID or permalink URL.',
      },
      limit: {
        type: 'number',
        description: 'Max comments to return across the whole tree. 1–100. Defaults to 30.',
      },
      depth: {
        type: 'number',
        description: 'Max tree depth. 1–5. Defaults to 3.',
      },
      sort: {
        type: 'string',
        enum: ['top', 'new', 'controversial', 'old', 'qa'],
        description: "Default 'top'.",
      },
    },
    required: ['postId'],
  },
  execute: async ({ postId, limit = 30, depth = 3, sort = 'top' }) => {
    try {
      const id = normalisePostId(postId);
      if (!id) return `Could not parse Reddit post ID from: ${postId}`;
      const client = getClient();
      const count = Math.min(100, Math.max(1, limit));
      const maxDepth = Math.min(5, Math.max(1, depth));
      const res = await client.get(`/comments/${id}`, {
        limit: count,
        sort,
        depth: maxDepth,
      });
      if (!Array.isArray(res) || res.length < 2) return `Reddit post ${id} not found or returned unexpected data.`;
      const out = [];
      const budget = { remaining: count };
      walkCommentTree(extractChildren(res[1]), '', 1, maxDepth, out, budget);
      if (!out.length) return `No comments found for post ${id}.`;
      return out.join('\n');
    } catch (err) {
      return handleError(err);
    }
  },
};

const reddit_list_subreddit_top = {
  name: 'reddit_list_subreddit_top',
  description: 'Top posts from a subreddit over a time window. Useful for monitoring specific communities for their highest-signal posts.',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      subreddit: {
        type: 'string',
        description: "Subreddit name without 'r/', e.g. 'Entrepreneur'.",
      },
      timeframe: {
        type: 'string',
        enum: ['day', 'week', 'month', 'year', 'all'],
        description: "Default 'week'.",
      },
      limit: {
        type: 'number',
        description: '1–25. Defaults to 10.',
      },
    },
    required: ['subreddit'],
  },
  execute: async ({ subreddit, timeframe = 'week', limit = 10 }) => {
    try {
      const client = getClient();
      const count = Math.min(25, Math.max(1, limit));
      const res = await client.get(`/r/${subreddit}/top`, { t: timeframe, limit: count });
      const posts = extractChildren(res).map(c => c.data);
      if (!posts.length) return `No top posts found in r/${subreddit} for timeframe '${timeframe}'.`;
      return posts.map((p, i) => formatSearchResult(p, i + 1)).join('\n\n');
    } catch (err) {
      return handleError(err);
    }
  },
};

const reddit_list_subreddit_new = {
  name: 'reddit_list_subreddit_new',
  description: 'Newest posts from a subreddit. Designed for ongoing monitoring missions — pair with the `after` cursor for pagination across runs.',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      subreddit: {
        type: 'string',
        description: "Subreddit name without 'r/'.",
      },
      limit: {
        type: 'number',
        description: '1–25. Defaults to 10.',
      },
      after: {
        type: 'string',
        description: "Optional fullname (e.g. 't3_xxx') for pagination.",
      },
    },
    required: ['subreddit'],
  },
  execute: async ({ subreddit, limit = 10, after }) => {
    try {
      const client = getClient();
      const count = Math.min(25, Math.max(1, limit));
      const params = { limit: count };
      if (after) params.after = after;
      const res = await client.get(`/r/${subreddit}/new`, params);
      const posts = extractChildren(res).map(c => c.data);
      if (!posts.length) return `No new posts found in r/${subreddit}.`;
      const body = posts.map((p, i) => formatSearchResult(p, i + 1)).join('\n\n');
      const nextAfter = res?.data?.after;
      return nextAfter ? `${body}\n\nNext page cursor: ${nextAfter}` : body;
    } catch (err) {
      return handleError(err);
    }
  },
};

export const tools = [
  reddit_search,
  reddit_get_post,
  reddit_get_comments,
  reddit_list_subreddit_top,
  reddit_list_subreddit_new,
];
