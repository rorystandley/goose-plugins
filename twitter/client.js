/**
 * Lazy singleton Twitter API client.
 *
 * Validates credentials on first use rather than at module load time so that
 * Goose's plugin discovery can import index.js safely without credentials set.
 *
 * Required environment variables:
 *   TWITTER_API_KEY            — OAuth 1.0a consumer key
 *   TWITTER_API_SECRET         — OAuth 1.0a consumer secret
 *   TWITTER_ACCESS_TOKEN       — OAuth 1.0a access token (user context)
 *   TWITTER_ACCESS_TOKEN_SECRET — OAuth 1.0a access token secret
 */

import { TwitterApi } from 'twitter-api-v2';

let _client = null;

export function getClient() {
  if (_client) return _client;

  const required = [
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_TOKEN_SECRET',
  ];

  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Twitter plugin: missing required environment variables: ${missing.join(', ')}`);
  }

  _client = new TwitterApi({
    appKey:      process.env.TWITTER_API_KEY,
    appSecret:   process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });

  return _client;
}

/** Reset the singleton — used by tests to inject a mock client. */
export function _resetClient() {
  _client = null;
}
