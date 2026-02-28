import { describe, it, afterEach, expect, vi } from 'vitest';

// Mock the client module so no real Twitter API calls are made.
// This must be called before any import of index.js.
vi.mock('../client.js', () => ({
  getClient: vi.fn(),
}));

import { getClient } from '../client.js';
import { tools } from '../index.js';

afterEach(() => {
  vi.clearAllMocks();
});

// ── tools export shape (default tier: basic) ──────────────────────────────────

describe('tools export', () => {
  it('exports a "tools" named export that is an Array', () => {
    expect(Array.isArray(tools)).toBe(true);
  });

  it('exports all 10 tools when no tier is set (defaults to basic)', () => {
    expect(tools).toHaveLength(10);
  });

  it('exports the correct tool names in order', () => {
    expect(tools.map(t => t.name)).toEqual([
      'twitter_search_tweets',
      'twitter_get_user',
      'twitter_get_timeline',
      'twitter_get_mentions',
      'twitter_get_home_feed',
      'twitter_like_tweet',
      'twitter_retweet',
      'twitter_post_tweet',
      'twitter_reply_to_tweet',
      'twitter_follow_user',
    ]);
  });
});

// ── TWITTER_API_TIER filtering ────────────────────────────────────────────────

describe('TWITTER_API_TIER filtering', () => {
  it('free tier exports only post_tweet and reply_to_tweet', async () => {
    vi.stubEnv('TWITTER_API_TIER', 'free');
    vi.resetModules();
    const { tools: tieredTools } = await import('../index.js');
    expect(tieredTools.map(t => t.name)).toEqual([
      'twitter_post_tweet',
      'twitter_reply_to_tweet',
    ]);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('basic tier exports all 10 tools', async () => {
    vi.stubEnv('TWITTER_API_TIER', 'basic');
    vi.resetModules();
    const { tools: tieredTools } = await import('../index.js');
    expect(tieredTools).toHaveLength(10);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('unknown tier defaults to all tools', async () => {
    vi.stubEnv('TWITTER_API_TIER', 'enterprise');
    vi.resetModules();
    const { tools: tieredTools } = await import('../index.js');
    expect(tieredTools).toHaveLength(10);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('free tier tools all have execute functions', async () => {
    vi.stubEnv('TWITTER_API_TIER', 'free');
    vi.resetModules();
    const { tools: tieredTools } = await import('../index.js');
    for (const tool of tieredTools) {
      expect(typeof tool.execute).toBe('function');
    }
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

// ── per-tool shape validation ─────────────────────────────────────────────────

describe('each tool has required Goose plugin interface fields', () => {
  it('every tool has name, description, riskLevel, parameters, execute', () => {
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.riskLevel).toBe('string');
      expect(typeof tool.parameters).toBe('object');
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('every tool parameters object has type "object" and a properties field', () => {
    for (const tool of tools) {
      expect(tool.parameters.type).toBe('object');
      expect(typeof tool.parameters.properties).toBe('object');
    }
  });

  it('read tools have riskLevel "safe"', () => {
    const readTools = ['twitter_search_tweets', 'twitter_get_user', 'twitter_get_timeline', 'twitter_get_mentions', 'twitter_get_home_feed'];
    for (const name of readTools) {
      const tool = tools.find(t => t.name === name);
      expect(tool.riskLevel, `${name} should be safe`).toBe('safe');
    }
  });

  it('like and retweet tools have riskLevel "moderate"', () => {
    const moderateTools = ['twitter_like_tweet', 'twitter_retweet'];
    for (const name of moderateTools) {
      const tool = tools.find(t => t.name === name);
      expect(tool.riskLevel, `${name} should be moderate`).toBe('moderate');
    }
  });

  it('post, reply, and follow tools have riskLevel "dangerous"', () => {
    const dangerousTools = ['twitter_post_tweet', 'twitter_reply_to_tweet', 'twitter_follow_user'];
    for (const name of dangerousTools) {
      const tool = tools.find(t => t.name === name);
      expect(tool.riskLevel, `${name} should be dangerous`).toBe('dangerous');
    }
  });
});

// ── parameter validation ──────────────────────────────────────────────────────

describe('twitter_search_tweets parameters', () => {
  it('has required parameter: query', () => {
    const tool = tools.find(t => t.name === 'twitter_search_tweets');
    expect(tool.parameters.required).toContain('query');
  });

  it('has optional parameter: maxResults', () => {
    const tool = tools.find(t => t.name === 'twitter_search_tweets');
    expect(tool.parameters.properties.maxResults).toBeDefined();
    expect(tool.parameters.required).not.toContain('maxResults');
  });
});

describe('twitter_get_user parameters', () => {
  it('has required parameter: username', () => {
    const tool = tools.find(t => t.name === 'twitter_get_user');
    expect(tool.parameters.required).toContain('username');
  });
});

describe('twitter_post_tweet parameters', () => {
  it('has required parameter: text', () => {
    const tool = tools.find(t => t.name === 'twitter_post_tweet');
    expect(tool.parameters.required).toContain('text');
  });
});

describe('twitter_reply_to_tweet parameters', () => {
  it('has required parameters: tweetId and text', () => {
    const tool = tools.find(t => t.name === 'twitter_reply_to_tweet');
    expect(tool.parameters.required).toContain('tweetId');
    expect(tool.parameters.required).toContain('text');
  });
});

describe('twitter_like_tweet parameters', () => {
  it('has required parameter: tweetId', () => {
    const tool = tools.find(t => t.name === 'twitter_like_tweet');
    expect(tool.parameters.required).toContain('tweetId');
  });
});

// ── behaviour: missing credentials ───────────────────────────────────────────

describe('missing credentials', () => {
  it('execute() returns error string when getClient throws (not throws itself)', async () => {
    getClient.mockImplementation(() => {
      throw new Error('Twitter plugin: missing required environment variables: TWITTER_API_KEY');
    });
    const tool = tools.find(t => t.name === 'twitter_search_tweets');
    const result = await tool.execute({ query: 'test' });
    expect(typeof result).toBe('string');
    expect(result).toContain('Error');
  });
});

// ── behaviour: twitter_search_tweets ─────────────────────────────────────────

describe('twitter_search_tweets', () => {
  it('returns formatted tweet list on success', async () => {
    getClient.mockReturnValue({
      v2: {
        search: vi.fn().mockResolvedValue({
          data: {
            data: [
              { id: '111', author_id: 'user1', text: 'Hello world', created_at: '2025-01-01T10:00:00Z' },
              { id: '222', author_id: 'user2', text: 'Another tweet', created_at: '2025-01-01T11:00:00Z' },
            ],
          },
        }),
      },
    });
    const tool = tools.find(t => t.name === 'twitter_search_tweets');
    const result = await tool.execute({ query: 'hello' });
    expect(result).toContain('Hello world');
    expect(result).toContain('Another tweet');
    expect(result).toContain('@user1');
  });

  it('returns "No tweets found" when result is empty', async () => {
    getClient.mockReturnValue({
      v2: { search: vi.fn().mockResolvedValue({ data: { data: [] } }) },
    });
    const tool = tools.find(t => t.name === 'twitter_search_tweets');
    const result = await tool.execute({ query: 'xyznothing' });
    expect(result).toContain('No tweets found');
  });

  it('returns error string on API error', async () => {
    const err = Object.assign(new Error('Unauthorized'), { code: 401 });
    getClient.mockReturnValue({
      v2: { search: vi.fn().mockRejectedValue(err) },
    });
    const tool = tools.find(t => t.name === 'twitter_search_tweets');
    const result = await tool.execute({ query: 'test' });
    expect(typeof result).toBe('string');
    expect(result).toContain('401');
  });
});

// ── behaviour: twitter_get_user ───────────────────────────────────────────────

describe('twitter_get_user', () => {
  it('returns formatted user profile on success', async () => {
    getClient.mockReturnValue({
      v2: {
        userByUsername: vi.fn().mockResolvedValue({
          data: {
            id: 'u1',
            name: 'Jack Dorsey',
            description: 'Founder of Twitter',
            public_metrics: { followers_count: 6000000, following_count: 3, tweet_count: 25000 },
            created_at: '2006-03-21T00:00:00Z',
          },
        }),
      },
    });
    const tool = tools.find(t => t.name === 'twitter_get_user');
    const result = await tool.execute({ username: 'jack' });
    expect(result).toContain('@jack');
    expect(result).toContain('Jack Dorsey');
    expect(result).toContain('Followers:');
  });

  it('returns "not found" when user does not exist', async () => {
    getClient.mockReturnValue({
      v2: { userByUsername: vi.fn().mockResolvedValue({ data: null }) },
    });
    const tool = tools.find(t => t.name === 'twitter_get_user');
    const result = await tool.execute({ username: 'doesnotexist12345' });
    expect(result).toContain('not found');
  });
});

// ── behaviour: twitter_post_tweet ────────────────────────────────────────────

describe('twitter_post_tweet', () => {
  it('returns confirmation with tweet ID on success', async () => {
    getClient.mockReturnValue({
      v2: { tweet: vi.fn().mockResolvedValue({ data: { id: '999888777' } }) },
    });
    const tool = tools.find(t => t.name === 'twitter_post_tweet');
    const result = await tool.execute({ text: 'Hello from Goose!' });
    expect(result).toContain('999888777');
    expect(result).toContain('Tweet posted');
  });

  it('returns error string on API error', async () => {
    const err = Object.assign(new Error('Forbidden'), { code: 403 });
    getClient.mockReturnValue({
      v2: { tweet: vi.fn().mockRejectedValue(err) },
    });
    const tool = tools.find(t => t.name === 'twitter_post_tweet');
    const result = await tool.execute({ text: 'test' });
    expect(typeof result).toBe('string');
    expect(result).toContain('403');
  });
});

// ── behaviour: twitter_like_tweet ────────────────────────────────────────────

describe('twitter_like_tweet', () => {
  it('returns confirmation on success', async () => {
    getClient.mockReturnValue({
      v2: {
        me: vi.fn().mockResolvedValue({ data: { id: 'me123' } }),
        like: vi.fn().mockResolvedValue({}),
      },
    });
    const tool = tools.find(t => t.name === 'twitter_like_tweet');
    const result = await tool.execute({ tweetId: '555' });
    expect(result).toContain('Liked tweet 555');
  });
});

// ── behaviour: twitter_follow_user ───────────────────────────────────────────

describe('twitter_follow_user', () => {
  it('returns confirmation on success', async () => {
    getClient.mockReturnValue({
      v2: {
        me: vi.fn().mockResolvedValue({ data: { id: 'me123' } }),
        userByUsername: vi.fn().mockResolvedValue({ data: { id: 'target456' } }),
        follow: vi.fn().mockResolvedValue({}),
      },
    });
    const tool = tools.find(t => t.name === 'twitter_follow_user');
    const result = await tool.execute({ username: 'nasa' });
    expect(result).toContain('following @nasa');
  });

  it('returns "not found" if username does not exist', async () => {
    getClient.mockReturnValue({
      v2: {
        me: vi.fn().mockResolvedValue({ data: { id: 'me123' } }),
        userByUsername: vi.fn().mockResolvedValue({ data: null }),
      },
    });
    const tool = tools.find(t => t.name === 'twitter_follow_user');
    const result = await tool.execute({ username: 'ghost99999' });
    expect(result).toContain('not found');
  });
});

// ── behaviour: rate limit handling ───────────────────────────────────────────

describe('rate limit handling', () => {
  it('returns a rate limit message with reset time when code is 429', async () => {
    const resetTime = Math.floor(Date.now() / 1000) + 900;
    const err = Object.assign(new Error('Too Many Requests'), {
      code: 429,
      rateLimit: { reset: resetTime },
    });
    getClient.mockReturnValue({
      v2: { search: vi.fn().mockRejectedValue(err) },
    });
    const tool = tools.find(t => t.name === 'twitter_search_tweets');
    const result = await tool.execute({ query: 'test' });
    expect(result).toContain('Rate limited');
    expect(result).toContain('Resets at:');
  });
});
