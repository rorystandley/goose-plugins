import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionInfo, createClient } from '../client.js';
import { buildBriefing } from '../briefing.js';
import { tools } from '../index.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-09-06T12:00:00Z');
const article = (n, values = {}) => ({ id: id(n), feedId: id(90), title: 'News story',
  url: `https://example.com/story/${n}`, feedTitle: 'Example', summary: 'Article excerpt',
  contentText: 'Full article text', createdAt: '2026-09-06T10:00:00Z', publishedAt: '2026-09-06T09:00:00Z',
  isRead: false, isStarred: false, isArchived: false, ...values });
const env = { LEDE_API_KEY: 'nrk_test-secret' };
const run = (name, args) => tools.find(tool => tool.name === name).execute(args);

function fixture(t, handle) {
  const oldKey = process.env.LEDE_API_KEY;
  const oldUrl = process.env.LEDE_BASE_URL;
  const oldFetch = globalThis.fetch;
  process.env.LEDE_API_KEY = env.LEDE_API_KEY;
  delete process.env.LEDE_BASE_URL;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    const data = await handle(url, options);
    return data instanceof Response ? data : new Response(JSON.stringify(data), { status: 200 });
  };
  t.after(() => {
    if (oldKey === undefined) delete process.env.LEDE_API_KEY; else process.env.LEDE_API_KEY = oldKey;
    if (oldUrl === undefined) delete process.env.LEDE_BASE_URL; else process.env.LEDE_BASE_URL = oldUrl;
    globalThis.fetch = oldFetch;
  });
  return calls;
}

function briefingClient(items, searches = [], override) {
  return { async request(path, options) {
    if (override) { const value = override(path, options); if (value !== undefined) return value; }
    if (path === '/folders/') return [{ id: id(80), name: 'Technology' }];
    if (path === '/search/saved') return searches;
    if (path === '/feeds/') return { items: [{ id: id(90), folderId: id(80) }], hasMore: false };
    if (path === '/articles/') return { items, hasMore: false };
    throw new Error(`Unexpected request ${path}`);
  } };
}

test('can discover every tool without credentials or network', async t => {
  const calls = fixture(t, () => assert.fail('No request expected'));
  delete process.env.LEDE_API_KEY;
  assert.equal(tools.length, 14);
  assert.equal(new Set(tools.map(tool => tool.name)).size, 14);
  const status = JSON.parse(await run('lede_status'));
  assert.equal(status.configured, false);
  assert.equal(status.connected, false);
  assert.match(await run('lede_list_articles'), /^Error: Set LEDE_API_KEY/);
  assert.equal(calls.length, 0);
});

test('origin validation prevents credential destinations in paths and insecure remote transport', () => {
  for (const base of ['http://example.com', 'https://example.com/api/v1', 'https://user:password@example.com', 'https://example.com/?x=1', 'file:///tmp/key']) {
    assert.throws(() => connectionInfo({ LEDE_BASE_URL: base }));
  }
  assert.equal(connectionInfo({ LEDE_BASE_URL: 'http://127.0.0.1:3000' }).baseUrl, 'http://127.0.0.1:3000');
});

test('REST contract: bearer auth, versioned path, false booleans and pagination', async t => {
  const calls = fixture(t, () => ({ items: [article(1)], page: 2, pageSize: 5, total: 10, hasMore: true }));
  const result = JSON.parse(await run('lede_list_articles', { isRead: false, isStarred: true, page: 2, pageSize: 5, folderId: id(80) }));
  assert.equal(calls[0].url.pathname, '/api/v1/articles/');
  assert.equal(calls[0].url.searchParams.get('isRead'), 'false');
  assert.equal(calls[0].url.searchParams.get('folderId'), id(80));
  assert.equal(calls[0].headers.Authorization, `Bearer ${env.LEDE_API_KEY}`);
  assert.equal(calls[0].redirect, 'error');
  assert.equal(result.hasMore, true);
  assert.equal(result.items[0].contentText, undefined);
});

test('search exposes page counts accurately and rejects ignored filters', async t => {
  const calls = fixture(t, () => ({ items: [], total: 0, page: 1, pageSize: 20, hasMore: false }));
  const result = JSON.parse(await run('lede_search_articles', { q: 'AI agents' }));
  assert.equal(calls[0].url.pathname, '/api/v1/articles/search');
  assert.equal(calls[0].url.searchParams.get('q'), 'AI agents');
  assert.match(result.totalMeaning, /Current page/);
  assert.match(await run('lede_search_articles', { q: 'AI', folderId: id(80) }), /^Error: Unsupported/);
  assert.equal(calls.length, 1);
});

test('invalid model arguments never reach the API', async t => {
  const calls = fixture(t, () => assert.fail('No request expected'));
  for (const [name, args] of [
    ['lede_get_article', { articleId: '../auth/api-keys' }],
    ['lede_set_star', { articleId: id(1), isStarred: 'false' }],
    ['lede_set_star', { articleId: id(1) }],
    ['lede_set_read_state', { articleIds: [], isRead: true }],
    ['lede_get_briefing', { limit: 1000 }],
    ['lede_get_briefing', { topics: [false] }],
    ['lede_list_articles', { pageSize: 1.5 }],
    ['lede_subscribe_feed', { url: 'file:///etc/passwd' }],
  ]) assert.match(await run(name, args), /^Error:/);
  assert.equal(calls.length, 0);
});

test('HTTP and transport errors are actionable and never echo secrets or server bodies', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const client = createClient({ env, fetchFn: async () => new Response(env.LEDE_API_KEY, { status }) });
    await assert.rejects(client.request('/user/profile'), error => error.message.includes(`HTTP ${status}`) && !error.message.includes(env.LEDE_API_KEY));
  }
  const client = createClient({ env, fetchFn: async () => { throw new Error(`redirect ${env.LEDE_API_KEY}`); } });
  await assert.rejects(client.request('/user/profile'), error => /Cannot connect/.test(error.message) && !error.message.includes(env.LEDE_API_KEY));
});

test('requests time out and never automatically retry writes', async () => {
  let calls = 0;
  const client = createClient({ env: { ...env, LEDE_TIMEOUT_MS: '100' }, fetchFn: async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort'))));
  } });
  await assert.rejects(client.request('/feeds/', { method: 'POST', body: { url: 'https://example.com/rss' } }), /timed out.*write may have completed/);
  assert.equal(calls, 1);
});

test('article reads are chunked and never mark read', async t => {
  const calls = fixture(t, () => article(1, { contentText: 'a'.repeat(1100) }));
  const result = JSON.parse(await run('lede_get_article', { articleId: id(1), offset: 500, maxChars: 500 }));
  assert.equal(result.content.length, 500);
  assert.equal(result.nextOffset, 1000);
  assert.equal(result.totalChars, 1100);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
});

test('state changes use explicit booleans, correct methods and handle 204 responses', async t => {
  const calls = fixture(t, () => new Response(null, { status: 204 }));
  assert.deepEqual(JSON.parse(await run('lede_set_star', { articleId: id(1), isStarred: false })), { ok: true });
  await run('lede_set_archived', { articleId: id(2), isArchived: true });
  await run('lede_set_read_state', { articleIds: [id(1)], isRead: false });
  assert.equal(calls[0].url.pathname, `/api/v1/articles/${id(1)}/star`);
  assert.equal(calls[0].method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0].body), { isStarred: false });
  assert.equal(calls[1].url.pathname, `/api/v1/articles/${id(2)}/archive`);
  assert.equal(calls[2].url.pathname, '/api/v1/articles/mark-unread');
  assert.equal(calls[2].method, 'POST');
});

test('briefing uses arrival window, relevance, folder labels and canonical deduplication', async () => {
  const items = [
    article(1, { title: 'AI agents launch', publishedAt: '2020-01-01T00:00:00Z' }),
    article(2, { title: 'Sports score' }),
    article(3, { title: 'Old arrival', createdAt: '2026-09-01T00:00:00Z' }),
    article(4, { title: 'Already read', isRead: true }),
    article(5, { url: 'https://example.com/story/1?utm_source=rss#top' }),
    article(6, { isArchived: true }),
  ];
  const searches = [{ name: 'AI', query: 'AI agents', filters: { folderIds: [id(80)] } }];
  const result = await buildBriefing(briefingClient(items, searches), { hours: 24 }, now);
  assert.equal(result.articles.length, 2);
  assert.equal(result.articles[0].id, id(1));
  assert.equal(result.articles[0].folder, 'Technology');
  assert.deepEqual(result.articles[0].reasons, ['Saved-search keywords: AI']);
  assert.equal(result.articles[0].publishedAt, '2020-01-01T00:00:00Z');
  assert.equal(result.scanTruncated, false);
});

test('saved-search filter mismatches do not boost unrelated articles; unsupported tags are visible', async () => {
  const searches = [
    { name: 'Wrong feed', query: 'AI', filters: { feedIds: [id(91)] } },
    { name: 'Read only', query: 'AI', filters: { isRead: true } },
    { name: 'Old dates', query: 'AI', filters: { dateTo: '2020-01-01T00:00:00Z' } },
    { name: 'Tagged', query: 'AI', filters: { tagIds: [id(70)] } },
  ];
  const result = await buildBriefing(briefingClient([article(1, { title: 'AI news' })], searches), {}, now);
  assert.equal(result.articles[0].score, 0);
  assert.match(result.warnings.join(), /Tag-filtered/);
});

test('briefing scans multiple pages and reports incomplete coverage at its budget', async () => {
  let pages = 0;
  const client = briefingClient([], [], (path, options) => {
    if (path === '/articles/') {
      pages++;
      assert.equal(options.query.sort, 'created_at');
      assert.equal(options.query.isRead, false);
      return { items: Array.from({ length: 100 }, (_, n) => article(n + pages * 100)), hasMore: true };
    }
  });
  const result = await buildBriefing(client, { limit: 5 }, now);
  assert.equal(pages, 3);
  assert.equal(result.scanned, 300);
  assert.equal(result.scanTruncated, true);
  assert.equal(result.articles.length, 5);
  assert.equal(result.omittedFromBriefing, 295);
});

test('briefing stops pagination at old arrivals and fails rather than hiding preference outages', async () => {
  let pages = 0;
  const client = briefingClient([], [], path => {
    if (path === '/articles/') { pages++; return { items: [article(1, { createdAt: '2026-01-01T00:00:00Z' })], hasMore: true }; }
  });
  const result = await buildBriefing(client, {}, now);
  assert.equal(pages, 1);
  assert.equal(result.articles.length, 0);
  await assert.rejects(buildBriefing({ request: async () => { throw new Error('offline'); } }, {}, now), /offline/);
});

test('digest retrieval is bounded and does not trigger a paid build', async t => {
  const calls = fixture(t, () => ({ id: id(50), createdAt: '2026-09-01T08:00:00Z', articleCount: 2,
    content: { briefing: 'Older briefing', sections: [{ folder: 'Technology', feeds: [{ articles: [article(1), article(2)] }] }] } }));
  const result = JSON.parse(await run('lede_get_digest', { limit: 1 }));
  assert.equal(result.articles.length, 1);
  assert.equal(result.omittedArticles, 1);
  assert.equal(result.createdAt, '2026-09-01T08:00:00Z');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url.pathname, '/api/v1/digests/latest');
});

test('safe tool set excludes writes and all writes are moderate', () => {
  const writes = tools.filter(tool => /set_|subscribe|refresh/.test(tool.name));
  assert.equal(writes.length, 5);
  assert.ok(writes.every(tool => tool.riskLevel === 'moderate'));
  assert.ok(tools.filter(tool => !writes.includes(tool)).every(tool => tool.riskLevel === 'safe'));
});
