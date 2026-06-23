import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveLiveConfig } from '../scripts/lib/live-test-config.mjs';

test('saved live config with url and instance prefers the full URL', () => {
  const resolved = resolveLiveConfig({
    known: {
      live: true,
      url: null,
      instance: null,
      port: null,
      clientId: null,
      clientSecret: null
    },
    liveConfig: {
      url: 'https://cloud.zeyos.com/demo',
      instance: 'demo',
      port: 8080,
      clientId: 'client-from-config',
      clientSecret: 'secret-from-config'
    },
    env: {}
  });

  assert.equal(resolved.url, 'https://cloud.zeyos.com/demo');
  assert.equal(resolved.instance, null);
  assert.equal(resolved.port, 8080);
  assert.equal(resolved.clientIdArg, 'client-from-config');
  assert.equal(resolved.clientSecretArg, 'secret-from-config');
});

test('explicit live URL and instance arguments remain explicit', () => {
  const resolved = resolveLiveConfig({
    known: {
      live: true,
      url: 'https://cloud.zeyos.com/demo',
      instance: 'demo',
      port: 8080,
      clientId: null,
      clientSecret: null
    },
    liveConfig: {
      url: 'https://cloud.zeyos.com/configured',
      instance: 'configured'
    },
    env: {}
  });

  assert.equal(resolved.url, 'https://cloud.zeyos.com/demo');
  assert.equal(resolved.instance, 'demo');
});
