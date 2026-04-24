import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock the client module so no real Reddit API calls are made.
// This must be called before any import of index.js.
vi.mock('../client.js', () => ({
  getClient: vi.fn(),
  _resetClient: vi.fn(),
}));

import { getClient } from '../client.js';
import { tools } from '../index.js';

afterEach(() => {
  vi.clearAllMocks();
});

// Convenience: build a Reddit-shaped Listing response from post data objects.
function listing(posts) {
  return {
    kind: 'Listing',
    data: {
      after: null,
      children: posts.map(p => ({ kind: 't3', data: p })),
    },
  };
}

function commentsListing(comments) {
  return {
    kind: 'Listing',
    data: {
      after: null,
      children: comments.map(c => ({ kind: 't1', data: c })),
    },
  };
}

// ── tools export shape ────────────────────────────────────────────────────────

describe('tools export', () => {
  it('exports a "tools" named export that is an Array', () => {
    expect(Array.isArray(tools)).toBe(true);
  });

  it('exports all 5 tools', () => {
    expect(tools).toHaveLength(5);
  });

  it('exports the correct tool names in order', () => {
    expect(tools.map(t => t.name)).toEqual([
      'reddit_search',
      'reddit_get_post',
      'reddit_get_comments',
      'reddit_list_subreddit_top',
      'reddit_list_subreddit_new',
    ]);
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

  it('all v1 tools are riskLevel "safe"', () => {
    for (const tool of tools) {
      expect(tool.riskLevel, `${tool.name} should be safe`).toBe('safe');
    }
  });
});

// ── parameter validation ──────────────────────────────────────────────────────

describe('reddit_search parameters', () => {
  const tool = tools.find(t => t.name === 'reddit_search');

  it('has required parameter: query', () => {
    expect(tool.parameters.required).toEqual(['query']);
  });

  it('declares optional filter parameters', () => {
    for (const key of ['subreddit', 'sort', 'timeframe', 'limit', 'minScore', 'minComments']) {
      expect(tool.parameters.properties[key]).toBeDefined();
      expect(tool.parameters.required).not.toContain(key);
    }
  });

  it('sort enum matches spec', () => {
    expect(tool.parameters.properties.sort.enum).toEqual(['relevance', 'hot', 'top', 'new', 'comments']);
  });

  it('timeframe enum matches spec', () => {
    expect(tool.parameters.properties.timeframe.enum).toEqual(['hour', 'day', 'week', 'month', 'year', 'all']);
  });
});

describe('reddit_get_post parameters', () => {
  const tool = tools.find(t => t.name === 'reddit_get_post');

  it('has required parameter: postId', () => {
    expect(tool.parameters.required).toEqual(['postId']);
  });

  it('commentSort enum matches spec', () => {
    expect(tool.parameters.properties.commentSort.enum).toEqual(['top', 'new', 'controversial', 'old', 'qa']);
  });
});

describe('reddit_get_comments parameters', () => {
  const tool = tools.find(t => t.name === 'reddit_get_comments');

  it('has required parameter: postId', () => {
    expect(tool.parameters.required).toEqual(['postId']);
  });

  it('sort enum matches spec', () => {
    expect(tool.parameters.properties.sort.enum).toEqual(['top', 'new', 'controversial', 'old', 'qa']);
  });
});

describe('reddit_list_subreddit_top parameters', () => {
  const tool = tools.find(t => t.name === 'reddit_list_subreddit_top');

  it('has required parameter: subreddit', () => {
    expect(tool.parameters.required).toEqual(['subreddit']);
  });

  it('timeframe enum matches spec', () => {
    expect(tool.parameters.properties.timeframe.enum).toEqual(['day', 'week', 'month', 'year', 'all']);
  });
});

describe('reddit_list_subreddit_new parameters', () => {
  const tool = tools.find(t => t.name === 'reddit_list_subreddit_new');

  it('has required parameter: subreddit', () => {
    expect(tool.parameters.required).toEqual(['subreddit']);
  });

  it('declares optional after cursor', () => {
    expect(tool.parameters.properties.after).toBeDefined();
    expect(tool.parameters.required).not.toContain('after');
  });
});

// ── behaviour: missing credentials ────────────────────────────────────────────

describe('missing credentials', () => {
  it('execute() returns error string when getClient throws (not throws itself)', async () => {
    getClient.mockImplementation(() => {
      throw new Error('Reddit plugin: missing required environment variables: REDDIT_USER_AGENT');
    });
    const tool = tools.find(t => t.name === 'reddit_search');
    const result = await tool.execute({ query: 'test' });
    expect(typeof result).toBe('string');
    expect(result).toContain('Error');
    expect(result).toContain('REDDIT_USER_AGENT');
  });
});

// ── behaviour: reddit_search ──────────────────────────────────────────────────

describe('reddit_search', () => {
  it('returns formatted post list on success', async () => {
    const get = vi.fn().mockResolvedValue(listing([
      { id: '1qn8pot', subreddit: 'java', author: 'BigHomieCed_', score: 196, num_comments: 239, created_utc: 1706294400, title: "Is Java's Biggest Limitation in 2026 Technical or Cultural?", selftext: 'Some selftext body.', permalink: '/r/java/comments/1qn8pot/foo/' },
      { id: 'abc', subreddit: 'java', author: 'someone', score: 50, num_comments: 12, created_utc: 1706294400, title: 'Another post', selftext: '', url: 'https://example.com' },
    ]));
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_search');
    const result = await tool.execute({ query: 'java' });
    expect(result).toContain('[1]');
    expect(result).toContain('ID: t3_1qn8pot');
    expect(result).toContain('r/java');
    expect(result).toContain('u/BigHomieCed_');
    expect(result).toContain("Is Java's Biggest Limitation");
    expect(result).toContain('https://www.reddit.com/r/java/comments/1qn8pot/foo/');
    expect(result).toContain('link or media post');
  });

  it('calls /search (global) when no subreddit is provided', async () => {
    const get = vi.fn().mockResolvedValue(listing([]));
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_search');
    await tool.execute({ query: 'hello' });
    expect(get).toHaveBeenCalledWith('/search', expect.objectContaining({ q: 'hello', sort: 'relevance', t: 'month', limit: 10 }));
    expect(get.mock.calls[0][1]).not.toHaveProperty('restrict_sr');
  });

  it('calls /r/{sub}/search with restrict_sr=1 when subreddit is provided', async () => {
    const get = vi.fn().mockResolvedValue(listing([]));
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_search');
    await tool.execute({ query: 'hello', subreddit: 'java' });
    expect(get).toHaveBeenCalledWith('/r/java/search', expect.objectContaining({ q: 'hello', restrict_sr: 1 }));
  });

  it('clamps limit to [1, 25]', async () => {
    const get = vi.fn().mockResolvedValue(listing([]));
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_search');
    await tool.execute({ query: 'x', limit: 500 });
    expect(get.mock.calls[0][1].limit).toBe(25);
    await tool.execute({ query: 'x', limit: 0 });
    expect(get.mock.calls[1][1].limit).toBe(1);
  });

  it('filters out posts below minScore and minComments', async () => {
    const get = vi.fn().mockResolvedValue(listing([
      { id: 'a', subreddit: 's', author: 'u', score: 5,  num_comments: 100, title: 'low score',   permalink: '/r/s/comments/a/' },
      { id: 'b', subreddit: 's', author: 'u', score: 50, num_comments: 1,   title: 'low comments', permalink: '/r/s/comments/b/' },
      { id: 'c', subreddit: 's', author: 'u', score: 50, num_comments: 10,  title: 'passes',       permalink: '/r/s/comments/c/' },
    ]));
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_search');
    const result = await tool.execute({ query: 'x', minScore: 10, minComments: 5 });
    expect(result).toContain('passes');
    expect(result).not.toContain('low score');
    expect(result).not.toContain('low comments');
  });

  it('returns "No Reddit posts" when filters drop everything', async () => {
    const get = vi.fn().mockResolvedValue(listing([
      { id: 'a', subreddit: 's', author: 'u', score: 1, num_comments: 0, title: 't', permalink: '/r/s/comments/a/' },
    ]));
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_search');
    const result = await tool.execute({ query: 'x', minScore: 100 });
    expect(result).toContain('No Reddit posts');
  });

  it('returns a rate-limit message on 429', async () => {
    const err = Object.assign(new Error('Too Many Requests'), {
      status: 429,
      headers: { 'x-ratelimit-reset': '42' },
    });
    getClient.mockReturnValue({ get: vi.fn().mockRejectedValue(err) });
    const tool = tools.find(t => t.name === 'reddit_search');
    const result = await tool.execute({ query: 'x' });
    expect(result).toContain('Rate limited');
    expect(result).toContain('42');
  });

  it('returns an auth error message on 401', async () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    getClient.mockReturnValue({ get: vi.fn().mockRejectedValue(err) });
    const tool = tools.find(t => t.name === 'reddit_search');
    const result = await tool.execute({ query: 'x' });
    expect(result).toContain('Reddit auth error 401');
  });

  it('returns a 404 message on not-found', async () => {
    const err = Object.assign(new Error('gone'), { status: 404 });
    getClient.mockReturnValue({ get: vi.fn().mockRejectedValue(err) });
    const tool = tools.find(t => t.name === 'reddit_search');
    const result = await tool.execute({ query: 'x' });
    expect(result).toContain('not found');
  });

  it('returns a server-error message on 503', async () => {
    const err = Object.assign(new Error('Service Unavailable'), { status: 503 });
    getClient.mockReturnValue({ get: vi.fn().mockRejectedValue(err) });
    const tool = tools.find(t => t.name === 'reddit_search');
    const result = await tool.execute({ query: 'x' });
    expect(result).toContain('bad day');
    expect(result).toContain('503');
  });
});

// ── behaviour: reddit_get_post ────────────────────────────────────────────────

describe('reddit_get_post', () => {
  function postResponse() {
    return [
      listing([{
        id: '1qn8pot',
        subreddit: 'java',
        author: 'BigHomieCed_',
        score: 196,
        num_comments: 239,
        created_utc: 1706294400,
        title: "Is Java's Biggest Limitation in 2026 Technical or Cultural?",
        selftext: 'Full selftext body here.',
        permalink: '/r/java/comments/1qn8pot/foo/',
      }]),
      commentsListing([
        { id: 'c1', author: 'woopsix', score: 3, created_utc: 1706294400, body: 'Purely cultural in my opinion.' },
        { id: 'c2', author: 'alice',   score: 1, created_utc: 1706294400, body: 'Second comment.' },
      ]),
    ];
  }

  it('returns formatted post + top comments on success', async () => {
    const get = vi.fn().mockResolvedValue(postResponse());
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_get_post');
    const result = await tool.execute({ postId: '1qn8pot' });
    expect(result).toContain('POST');
    expect(result).toContain('ID: t3_1qn8pot');
    expect(result).toContain('Selftext:');
    expect(result).toContain('Full selftext body here.');
    expect(result).toContain('TOP COMMENTS (2)');
    expect(result).toContain('u/woopsix');
    expect(result).toContain('Purely cultural');
  });

  it('normalises a bare post ID', async () => {
    const get = vi.fn().mockResolvedValue(postResponse());
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_get_post');
    await tool.execute({ postId: '1qn8pot' });
    expect(get).toHaveBeenCalledWith('/comments/1qn8pot', expect.any(Object));
  });

  it('normalises a fullname ID like t3_xxx', async () => {
    const get = vi.fn().mockResolvedValue(postResponse());
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_get_post');
    await tool.execute({ postId: 't3_1qn8pot' });
    expect(get).toHaveBeenCalledWith('/comments/1qn8pot', expect.any(Object));
  });

  it('normalises a full permalink URL', async () => {
    const get = vi.fn().mockResolvedValue(postResponse());
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_get_post');
    await tool.execute({ postId: 'https://www.reddit.com/r/java/comments/1qn8pot/foo/' });
    expect(get).toHaveBeenCalledWith('/comments/1qn8pot', expect.any(Object));
  });

  it('passes commentLimit (clamped 1..50) and commentSort through', async () => {
    const get = vi.fn().mockResolvedValue(postResponse());
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_get_post');
    await tool.execute({ postId: '1qn8pot', commentLimit: 99, commentSort: 'new' });
    expect(get).toHaveBeenCalledWith('/comments/1qn8pot', expect.objectContaining({ limit: 50, sort: 'new', depth: 1 }));
  });

  it('handles empty selftext with a "no text content" placeholder', async () => {
    const res = postResponse();
    res[0].data.children[0].data.selftext = '';
    const get = vi.fn().mockResolvedValue(res);
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_get_post');
    const result = await tool.execute({ postId: '1qn8pot' });
    expect(result).toContain('no text content');
  });

  it('returns a parse error for unparseable postId input', async () => {
    const tool = tools.find(t => t.name === 'reddit_get_post');
    const result = await tool.execute({ postId: 'https://not-a-reddit-url.example/' });
    expect(result).toContain('Could not parse Reddit post ID');
  });

  it('returns "not found" when the API returns an empty listing', async () => {
    getClient.mockReturnValue({ get: vi.fn().mockResolvedValue([listing([]), commentsListing([])]) });
    const tool = tools.find(t => t.name === 'reddit_get_post');
    const result = await tool.execute({ postId: '1qn8pot' });
    expect(result).toContain('not found');
  });

  it('returns 404 error from the API cleanly', async () => {
    const err = Object.assign(new Error('gone'), { status: 404 });
    getClient.mockReturnValue({ get: vi.fn().mockRejectedValue(err) });
    const tool = tools.find(t => t.name === 'reddit_get_post');
    const result = await tool.execute({ postId: '1qn8pot' });
    expect(result).toContain('not found');
  });
});

// ── behaviour: reddit_get_comments ────────────────────────────────────────────

describe('reddit_get_comments', () => {
  it('flattens a nested tree with indentation markers', async () => {
    const nested = commentsListing([
      {
        id: 'a', author: 'alice', score: 42, body: 'original reply',
        replies: commentsListing([
          {
            id: 'b', author: 'bob', score: 12, body: 'reply to alice',
            replies: commentsListing([
              { id: 'a2', author: 'alice', score: 5, body: 'reply to bob', replies: '' },
            ]),
          },
        ]),
      },
      { id: 'c', author: 'carol', score: 30, body: 'another top-level reply', replies: '' },
    ]);
    const get = vi.fn().mockResolvedValue([listing([]), nested]);
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_get_comments');
    const result = await tool.execute({ postId: '1qn8pot' });
    expect(result).toContain('[1] u/alice');
    expect(result).toContain('  [1.1] u/bob');
    expect(result).toContain('    [1.1.1] u/alice');
    expect(result).toContain('[2] u/carol');
  });

  it('respects depth cap', async () => {
    const nested = commentsListing([
      {
        id: 'a', author: 'alice', score: 1, body: 'top',
        replies: commentsListing([
          {
            id: 'b', author: 'bob', score: 1, body: 'second',
            replies: commentsListing([
              { id: 'c', author: 'carol', score: 1, body: 'third-too-deep', replies: '' },
            ]),
          },
        ]),
      },
    ]);
    const get = vi.fn().mockResolvedValue([listing([]), nested]);
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_get_comments');
    const result = await tool.execute({ postId: '1qn8pot', depth: 2 });
    expect(result).toContain('alice');
    expect(result).toContain('bob');
    expect(result).not.toContain('third-too-deep');
  });

  it('respects the overall limit budget', async () => {
    const many = commentsListing(
      Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, author: `u${i}`, score: 1, body: `body${i}`, replies: '' })),
    );
    const get = vi.fn().mockResolvedValue([listing([]), many]);
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_get_comments');
    const result = await tool.execute({ postId: '1qn8pot', limit: 3 });
    const lines = result.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
  });

  it('returns "No comments" when the tree is empty', async () => {
    const get = vi.fn().mockResolvedValue([listing([]), commentsListing([])]);
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_get_comments');
    const result = await tool.execute({ postId: '1qn8pot' });
    expect(result).toContain('No comments');
  });
});

// ── behaviour: reddit_list_subreddit_top ──────────────────────────────────────

describe('reddit_list_subreddit_top', () => {
  it('calls /r/{sub}/top with timeframe and limit', async () => {
    const get = vi.fn().mockResolvedValue(listing([
      { id: 'x', subreddit: 'Entrepreneur', author: 'u', score: 100, num_comments: 50, title: 'Best of week', permalink: '/r/Entrepreneur/comments/x/' },
    ]));
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_list_subreddit_top');
    const result = await tool.execute({ subreddit: 'Entrepreneur', timeframe: 'week', limit: 5 });
    expect(get).toHaveBeenCalledWith('/r/Entrepreneur/top', { t: 'week', limit: 5 });
    expect(result).toContain('Best of week');
    expect(result).toContain('r/Entrepreneur');
  });

  it('returns a not-found message on empty listing', async () => {
    const get = vi.fn().mockResolvedValue(listing([]));
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_list_subreddit_top');
    const result = await tool.execute({ subreddit: 'Empty' });
    expect(result).toContain('No top posts');
  });
});

// ── behaviour: reddit_list_subreddit_new ──────────────────────────────────────

describe('reddit_list_subreddit_new', () => {
  it('calls /r/{sub}/new and surfaces the next page cursor', async () => {
    const res = listing([
      { id: 'n1', subreddit: 'Entrepreneur', author: 'u', score: 1, num_comments: 0, title: 'New post', permalink: '/r/Entrepreneur/comments/n1/' },
    ]);
    res.data.after = 't3_n1';
    const get = vi.fn().mockResolvedValue(res);
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_list_subreddit_new');
    const result = await tool.execute({ subreddit: 'Entrepreneur' });
    expect(get).toHaveBeenCalledWith('/r/Entrepreneur/new', { limit: 10 });
    expect(result).toContain('Next page cursor: t3_n1');
  });

  it('passes `after` through when provided', async () => {
    const get = vi.fn().mockResolvedValue(listing([]));
    getClient.mockReturnValue({ get });
    const tool = tools.find(t => t.name === 'reddit_list_subreddit_new');
    await tool.execute({ subreddit: 'Entrepreneur', after: 't3_abc' });
    expect(get).toHaveBeenCalledWith('/r/Entrepreneur/new', { limit: 10, after: 't3_abc' });
  });
});

// ── client: token caching + env-var validation ────────────────────────────────

describe('client.js', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('getClient throws a clear error when REDDIT_USER_AGENT is missing', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'secret');
    vi.stubEnv('REDDIT_USER_AGENT', '');
    const real = await vi.importActual('../client.js');
    real._resetClient();
    expect(() => real.getClient()).toThrow(/REDDIT_USER_AGENT/);
  });

  it('caches the bearer token across calls (only one /access_token request)', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'secret');
    vi.stubEnv('REDDIT_USER_AGENT', 'goose-test/1.0');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ access_token: 'tok_abc', expires_in: 3600 }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['x-ratelimit-remaining', '100'], ['x-ratelimit-reset', '60']]),
        json: async () => listing([]),
      });
    vi.stubGlobal('fetch', fetchMock);

    const real = await vi.importActual('../client.js');
    real._resetClient();
    const client = real.getClient();
    await client.get('/search', { q: 'a' });
    await client.get('/search', { q: 'b' });

    const tokenCalls = fetchMock.mock.calls.filter(c => String(c[0]).includes('/api/v1/access_token'));
    expect(tokenCalls).toHaveLength(1);

    const apiCalls = fetchMock.mock.calls.filter(c => String(c[0]).startsWith('https://oauth.reddit.com'));
    expect(apiCalls).toHaveLength(2);
    const headers = apiCalls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer tok_abc');
    expect(headers['User-Agent']).toBe('goose-test/1.0');
  });

  it('throws an error with status + headers on non-ok API responses', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'secret');
    vi.stubEnv('REDDIT_USER_AGENT', 'goose-test/1.0');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([['x-ratelimit-reset', '42']]),
        text: async () => '',
      });
    vi.stubGlobal('fetch', fetchMock);

    const real = await vi.importActual('../client.js');
    real._resetClient();
    const client = real.getClient();
    await expect(client.get('/search', { q: 'x' })).rejects.toMatchObject({
      status: 429,
      headers: expect.objectContaining({ 'x-ratelimit-reset': '42' }),
    });
  });
});
