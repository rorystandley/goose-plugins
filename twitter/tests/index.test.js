import { describe, it, afterEach, expect, vi } from 'vitest';

// Mock the client module so no real Twitter API calls are made.
// This must be called before any import of index.js.
vi.mock('../client.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return { ...actual, default: { ...actual, appendFileSync: vi.fn() } };
});

import fs from 'fs';

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

  it('exports all 12 tools when no tier is set (defaults to basic)', () => {
    expect(tools).toHaveLength(12);
  });

  it('exports the correct tool names in order', () => {
    expect(tools.map(t => t.name)).toEqual([
      'twitter_search_tweets',
      'twitter_get_user',
      'twitter_get_timeline',
      'twitter_get_mentions',
      'twitter_get_home_feed',
      'twitter_get_tweet',
      'twitter_like_tweet',
      'twitter_retweet',
      'twitter_post_tweet',
      'twitter_reply_to_tweet',
      'twitter_follow_user',
      'twitter_log_tweet',
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

  it('basic tier exports all 12 tools', async () => {
    vi.stubEnv('TWITTER_API_TIER', 'basic');
    vi.resetModules();
    const { tools: tieredTools } = await import('../index.js');
    expect(tieredTools).toHaveLength(12);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('unknown tier defaults to all tools', async () => {
    vi.stubEnv('TWITTER_API_TIER', 'enterprise');
    vi.resetModules();
    const { tools: tieredTools } = await import('../index.js');
    expect(tieredTools).toHaveLength(12);
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

  it('read and local tools have riskLevel "safe"', () => {
    const safeTools = ['twitter_search_tweets', 'twitter_get_user', 'twitter_get_timeline', 'twitter_get_mentions', 'twitter_get_home_feed', 'twitter_get_tweet', 'twitter_log_tweet'];
    for (const name of safeTools) {
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

  it('has optional parameters: sinceId and startTime', () => {
    const tool = tools.find(t => t.name === 'twitter_search_tweets');
    expect(tool.parameters.properties.sinceId).toBeDefined();
    expect(tool.parameters.properties.startTime).toBeDefined();
    expect(tool.parameters.required).not.toContain('sinceId');
    expect(tool.parameters.required).not.toContain('startTime');
  });
});

describe('twitter_get_timeline parameters', () => {
  it('has optional parameters: sinceId and startTime', () => {
    const tool = tools.find(t => t.name === 'twitter_get_timeline');
    expect(tool.parameters.properties.sinceId).toBeDefined();
    expect(tool.parameters.properties.startTime).toBeDefined();
    expect(tool.parameters.required).not.toContain('sinceId');
    expect(tool.parameters.required).not.toContain('startTime');
  });
});

describe('twitter_get_mentions parameters', () => {
  it('has optional parameters: sinceId and startTime', () => {
    const tool = tools.find(t => t.name === 'twitter_get_mentions');
    expect(tool.parameters.properties.sinceId).toBeDefined();
    expect(tool.parameters.properties.startTime).toBeDefined();
    expect(tool.parameters.required).not.toContain('sinceId');
    expect(tool.parameters.required).not.toContain('startTime');
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

describe('twitter_get_tweet parameters', () => {
  it('has required parameter: tweetId', () => {
    const tool = tools.find(t => t.name === 'twitter_get_tweet');
    expect(tool.parameters.required).toContain('tweetId');
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

  it('passes since_id and start_time to the API when provided', async () => {
    const search = vi.fn().mockResolvedValue({
      data: { data: [{ id: '111', author_id: 'user1', text: 'Test', created_at: '2025-01-01T10:00:00Z' }] },
    });
    getClient.mockReturnValue({ v2: { search } });
    const tool = tools.find(t => t.name === 'twitter_search_tweets');
    await tool.execute({ query: 'hello', sinceId: '100', startTime: '2025-01-01T00:00:00Z' });
    expect(search).toHaveBeenCalledWith('hello', expect.objectContaining({
      since_id: '100',
      start_time: '2025-01-01T00:00:00Z',
    }));
  });

  it('does not include since_id or start_time when not provided', async () => {
    const search = vi.fn().mockResolvedValue({
      data: { data: [{ id: '111', author_id: 'user1', text: 'Test', created_at: '2025-01-01T10:00:00Z' }] },
    });
    getClient.mockReturnValue({ v2: { search } });
    const tool = tools.find(t => t.name === 'twitter_search_tweets');
    await tool.execute({ query: 'hello' });
    const opts = search.mock.calls[0][1];
    expect(opts).not.toHaveProperty('since_id');
    expect(opts).not.toHaveProperty('start_time');
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

// ── behaviour: twitter_get_mentions time filtering ───────────────────────────

describe('twitter_get_mentions time filtering', () => {
  it('passes since_id and start_time to the API when provided', async () => {
    const userMentionTimeline = vi.fn().mockResolvedValue({
      data: { data: [{ id: '111', author_id: 'user1', text: 'Hey!', created_at: '2025-01-01T10:00:00Z' }] },
      includes: { users: [{ id: 'user1', username: 'someone' }] },
    });
    getClient.mockReturnValue({
      v2: {
        me: vi.fn().mockResolvedValue({ data: { id: 'me123' } }),
        userMentionTimeline,
      },
    });
    const tool = tools.find(t => t.name === 'twitter_get_mentions');
    await tool.execute({ sinceId: '200', startTime: '2025-01-01T00:00:00Z' });
    expect(userMentionTimeline).toHaveBeenCalledWith('me123', expect.objectContaining({
      since_id: '200',
      start_time: '2025-01-01T00:00:00Z',
    }));
  });

  it('does not include since_id or start_time when not provided', async () => {
    const userMentionTimeline = vi.fn().mockResolvedValue({
      data: { data: [{ id: '111', author_id: 'user1', text: 'Hey!', created_at: '2025-01-01T10:00:00Z' }] },
      includes: { users: [{ id: 'user1', username: 'someone' }] },
    });
    getClient.mockReturnValue({
      v2: {
        me: vi.fn().mockResolvedValue({ data: { id: 'me123' } }),
        userMentionTimeline,
      },
    });
    const tool = tools.find(t => t.name === 'twitter_get_mentions');
    await tool.execute();
    const opts = userMentionTimeline.mock.calls[0][1];
    expect(opts).not.toHaveProperty('since_id');
    expect(opts).not.toHaveProperty('start_time');
  });
});

// ── behaviour: twitter_get_timeline time filtering ──────────────────────────

describe('twitter_get_timeline time filtering', () => {
  it('passes since_id and start_time to the API when provided', async () => {
    const userTimeline = vi.fn().mockResolvedValue({
      data: { data: [{ id: '111', text: 'My tweet', created_at: '2025-01-01T10:00:00Z' }] },
    });
    getClient.mockReturnValue({
      v2: {
        userByUsername: vi.fn().mockResolvedValue({ data: { id: 'uid1' } }),
        userTimeline,
      },
    });
    const tool = tools.find(t => t.name === 'twitter_get_timeline');
    await tool.execute({ username: 'testuser', sinceId: '300', startTime: '2025-01-01T00:00:00Z' });
    expect(userTimeline).toHaveBeenCalledWith('uid1', expect.objectContaining({
      since_id: '300',
      start_time: '2025-01-01T00:00:00Z',
    }));
  });

  it('does not include since_id or start_time when not provided', async () => {
    const userTimeline = vi.fn().mockResolvedValue({
      data: { data: [{ id: '111', text: 'My tweet', created_at: '2025-01-01T10:00:00Z' }] },
    });
    getClient.mockReturnValue({
      v2: {
        userByUsername: vi.fn().mockResolvedValue({ data: { id: 'uid1' } }),
        userTimeline,
      },
    });
    const tool = tools.find(t => t.name === 'twitter_get_timeline');
    await tool.execute({ username: 'testuser' });
    const opts = userTimeline.mock.calls[0][1];
    expect(opts).not.toHaveProperty('since_id');
    expect(opts).not.toHaveProperty('start_time');
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
    expect(result).toContain('Hello from Goose!');
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

// ── behaviour: twitter_reply_to_tweet ────────────────────────────────────────

describe('twitter_reply_to_tweet', () => {
  it('returns confirmation with reply ID on success', async () => {
    getClient.mockReturnValue({
      v2: { reply: vi.fn().mockResolvedValue({ data: { id: '777666555' } }) },
    });
    const tool = tools.find(t => t.name === 'twitter_reply_to_tweet');
    const result = await tool.execute({ tweetId: '111222333', text: 'Great point!' });
    expect(result).toContain('777666555');
    expect(result).toContain('Reply posted');
  });

  it('returns 403 error with permissions guidance for auth-type errors', async () => {
    const err = Object.assign(new Error('Forbidden'), {
      code: 403,
      data: { detail: 'You are not permitted to create a Tweet on behalf of this user.' },
    });
    getClient.mockReturnValue({
      v2: { reply: vi.fn().mockRejectedValue(err) },
    });
    const tool = tools.find(t => t.name === 'twitter_reply_to_tweet');
    const result = await tool.execute({ tweetId: '111222333', text: 'test reply' });
    expect(typeof result).toBe('string');
    expect(result).toContain('403');
    expect(result).toContain('Read+Write permissions');
  });

  it('returns 403 error with account restriction hint for non-permission errors', async () => {
    const err = Object.assign(new Error('Forbidden'), {
      code: 403,
      data: { detail: 'Replies are restricted for this tweet.' },
    });
    getClient.mockReturnValue({
      v2: { reply: vi.fn().mockRejectedValue(err) },
    });
    const tool = tools.find(t => t.name === 'twitter_reply_to_tweet');
    const result = await tool.execute({ tweetId: '111222333', text: 'test reply' });
    expect(typeof result).toBe('string');
    expect(result).toContain('403');
    expect(result).toContain('account-level restriction');
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

// ── behaviour: twitter_get_tweet ──────────────────────────────────────────────

describe('twitter_get_tweet', () => {
  it('returns formatted tweet on success', async () => {
    getClient.mockReturnValue({
      v2: {
        singleTweet: vi.fn().mockResolvedValue({
          data: {
            id: '123456',
            author_id: 'user1',
            text: 'Hello from Twitter!',
            created_at: '2025-06-01T12:00:00Z',
            public_metrics: { like_count: 10, retweet_count: 3, reply_count: 1 },
          },
        }),
      },
    });
    const tool = tools.find(t => t.name === 'twitter_get_tweet');
    const result = await tool.execute({ tweetId: '123456' });
    expect(result).toContain('Hello from Twitter!');
    expect(result).toContain('@user1');
    expect(result).toContain('Likes: 10');
  });

  it('returns "not found" when tweet does not exist', async () => {
    getClient.mockReturnValue({
      v2: { singleTweet: vi.fn().mockResolvedValue({ data: null }) },
    });
    const tool = tools.find(t => t.name === 'twitter_get_tweet');
    const result = await tool.execute({ tweetId: '999' });
    expect(result).toContain('not found');
  });

  it('extracts ID from a twitter.com URL', async () => {
    const singleTweet = vi.fn().mockResolvedValue({
      data: { id: '7890', author_id: 'u2', text: 'URL test', created_at: '2025-06-01T12:00:00Z', public_metrics: {} },
    });
    getClient.mockReturnValue({ v2: { singleTweet } });
    const tool = tools.find(t => t.name === 'twitter_get_tweet');
    await tool.execute({ tweetId: 'https://twitter.com/someone/status/7890' });
    expect(singleTweet).toHaveBeenCalledWith('7890', expect.any(Object));
  });

  it('extracts ID from an x.com URL', async () => {
    const singleTweet = vi.fn().mockResolvedValue({
      data: { id: '4567', author_id: 'u3', text: 'X test', created_at: '2025-06-01T12:00:00Z', public_metrics: {} },
    });
    getClient.mockReturnValue({ v2: { singleTweet } });
    const tool = tools.find(t => t.name === 'twitter_get_tweet');
    await tool.execute({ tweetId: 'https://x.com/someone/status/4567' });
    expect(singleTweet).toHaveBeenCalledWith('4567', expect.any(Object));
  });

  it('returns error string on API error', async () => {
    const err = Object.assign(new Error('Not Found'), { code: 404 });
    getClient.mockReturnValue({
      v2: { singleTweet: vi.fn().mockRejectedValue(err) },
    });
    const tool = tools.find(t => t.name === 'twitter_get_tweet');
    const result = await tool.execute({ tweetId: '000' });
    expect(typeof result).toBe('string');
    expect(result).toContain('404');
  });
});

// ── behaviour: credits depleted handling ──────────────────────────────────────

describe('credits depleted handling', () => {
  it('returns a clear credits depleted message when code is 402', async () => {
    const err = Object.assign(new Error('Request failed with code 402'), {
      code: 402,
      data: {
        title: 'CreditsDepleted',
        detail: 'Your enrolled account does not have any credits to fulfill this request.',
      },
    });
    getClient.mockReturnValue({
      v2: { tweet: vi.fn().mockRejectedValue(err) },
    });
    const tool = tools.find(t => t.name === 'twitter_post_tweet');
    const result = await tool.execute({ text: 'test tweet' });
    expect(result).toContain('credits depleted');
    expect(result).toContain('402');
    expect(result).toContain('monthly reset');
  });
});

// ── behaviour: twitter_log_tweet ──────────────────────────────────────────────

describe('twitter_log_tweet', () => {
  it('appends a JSONL entry to the history file', async () => {
    const tool = tools.find(t => t.name === 'twitter_log_tweet');
    const result = await tool.execute({
      content: 'Test tweet about local AI',
      topic: 'local AI',
      angle: 'hot take',
    });
    expect(result).toContain('Logged tweet');
    expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
    const [, data] = fs.appendFileSync.mock.calls[0];
    const entry = JSON.parse(data.trim());
    expect(entry.content).toBe('Test tweet about local AI');
    expect(entry.topic).toBe('local AI');
    expect(entry.angle).toBe('hot take');
    expect(entry.timestamp).toBeDefined();
  });

  it('defaults topic and angle to empty strings', async () => {
    const tool = tools.find(t => t.name === 'twitter_log_tweet');
    await tool.execute({ content: 'Minimal tweet' });
    const [, data] = fs.appendFileSync.mock.calls[0];
    const entry = JSON.parse(data.trim());
    expect(entry.topic).toBe('');
    expect(entry.angle).toBe('');
  });

  it('truncates content to 280 characters', async () => {
    const tool = tools.find(t => t.name === 'twitter_log_tweet');
    const longContent = 'A'.repeat(300);
    await tool.execute({ content: longContent });
    const [, data] = fs.appendFileSync.mock.calls[0];
    const entry = JSON.parse(data.trim());
    expect(entry.content).toHaveLength(280);
  });

  it('returns error message on write failure', async () => {
    fs.appendFileSync.mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    const tool = tools.find(t => t.name === 'twitter_log_tweet');
    const result = await tool.execute({ content: 'fail tweet' });
    expect(result).toContain('Failed to log tweet');
    expect(result).toContain('ENOENT');
  });
});
