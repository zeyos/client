import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { createZeyosClient } from '../src/index.js';

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseArgs(argv) {
  const known = {
    url: null,
    instance: null,
    port: null,
    clientId: null,
    clientSecret: null,
    live: false,
    noOpen: false,
    noSaveConfig: false
  };
  const passthrough = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--url') {
      known.url = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith('--url=')) {
      known.url = arg.slice('--url='.length);
      continue;
    }

    if (arg === '--instance') {
      known.instance = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith('--instance=')) {
      known.instance = arg.slice('--instance='.length);
      continue;
    }

    if (arg === '--port') {
      known.port = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith('--port=')) {
      known.port = arg.slice('--port='.length);
      continue;
    }

    if (arg === '--client-id') {
      known.clientId = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith('--client-id=')) {
      known.clientId = arg.slice('--client-id='.length);
      continue;
    }

    if (arg === '--client-secret') {
      known.clientSecret = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith('--client-secret=')) {
      known.clientSecret = arg.slice('--client-secret='.length);
      continue;
    }

    if (arg === '--no-open') {
      known.noOpen = true;
      continue;
    }

    if (arg === '--live') {
      known.live = true;
      continue;
    }

    if (arg === '--no-save-config') {
      known.noSaveConfig = true;
      continue;
    }

    passthrough.push(arg);
  }

  return { known, passthrough };
}

function runOrExit(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function collectTestFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(absolute));
      continue;
    }

    if (entry.isFile() && /\.test\.(js|mjs|cjs)$/i.test(entry.name)) {
      files.push(absolute);
    }
  }

  return files;
}

function parsePositivePort(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }
  return parsed;
}

function base64Url(value) {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildPkcePair() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function openBrowser(url) {
  if (process.platform === 'darwin') {
    const child = spawn('open', [url], { stdio: 'ignore', detached: true });
    child.unref();
    return;
  }

  if (process.platform === 'win32') {
    const child = spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true, shell: false });
    child.unref();
    return;
  }

  const child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
  child.unref();
}

function parseTargetFromUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('`--url` must be a valid URL, e.g. https://cloud.zeyos.com/demo');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('`--url` must use http or https.');
  }

  const segments = parsed.pathname
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length !== 1) {
    throw new Error('`--url` must include exactly one path segment for the instance, e.g. https://cloud.zeyos.com/demo');
  }

  const instance = decodeURIComponent(segments[0]);

  return {
    origin: parsed.origin,
    instance,
    instanceUrl: `${parsed.origin}/${encodeURIComponent(instance)}`
  };
}

async function loadTestConfig(configPath) {
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : {};
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Failed to read ${configPath}: ${error.message || error}`);
  }
}

async function saveTestConfig(configPath, config) {
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  await writeFile(configPath, serialized, 'utf8');
}

async function promptForClientId(clientId) {
  if (clientId) {
    return clientId;
  }

  if (!process.stdin.isTTY) {
    throw new Error('Missing OAuth client ID. Pass --client-id (or set in config.test.json).');
  }

  const rl = readline.createInterface({ input, output });
  try {
    const value = (await rl.question('OAuth client ID: ')).trim();
    if (!value) {
      throw new Error('OAuth client ID is required.');
    }
    return value;
  } finally {
    rl.close();
  }
}

async function promptForClientSecret(clientSecret) {
  if (clientSecret) {
    return clientSecret;
  }

  if (!process.stdin.isTTY) {
    throw new Error('Missing OAuth client secret. Pass --client-secret (or set in config.test.json).');
  }

  const rl = readline.createInterface({ input, output });
  try {
    const value = (await rl.question('OAuth client secret: ')).trim();
    if (!value) {
      throw new Error('OAuth client secret is required for token exchange.');
    }
    return value;
  } finally {
    rl.close();
  }
}

async function runInteractiveOAuthLiveTest({ target, port, clientId, getClientSecret, noOpen }) {
  const callbackPath = '/oauth/callback';
  const redirectUri = `http://localhost:${port}${callbackPath}`;
  const state = base64Url(randomBytes(12));
  const pkce = buildPkcePair();

  const client = createZeyosClient({
    platform: {
      origin: target.origin,
      instance: target.instance
    },
    auth: {
      mode: 'oauth',
      oauth: {
        clientId
      }
    }
  });

  const authorizationUrl = client.oauth2.buildAuthorizationUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: pkce.challenge,
    codeChallengeMethod: 'S256'
  });

  const timeoutMs = 5 * 60 * 1000;

  console.log('\nLive OAuth test target:', target.instanceUrl);
  console.log('Callback URL:', redirectUri);
  console.log('Authorization URL:', authorizationUrl);

  const tokenSet = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      void (async () => {
        try {
          const requestUrl = new URL(req.url || '/', `http://localhost:${port}`);

          if (requestUrl.pathname !== callbackPath) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
          }

          const callbackState = requestUrl.searchParams.get('state');
          const code = requestUrl.searchParams.get('code');
          const error = requestUrl.searchParams.get('error');
          const errorDescription = requestUrl.searchParams.get('error_description');

          if (error) {
            throw new Error(`OAuth authorization error: ${error}${errorDescription ? ` (${errorDescription})` : ''}`);
          }

          if (!code) {
            throw new Error('OAuth callback did not include an authorization code.');
          }

          if (callbackState !== state) {
            throw new Error('OAuth state mismatch in callback.');
          }

          const clientSecret = await getClientSecret();

          const exchangedTokenSet = await client.oauth2.exchangeAuthorizationCode({
            code,
            redirectUri,
            codeVerifier: pkce.verifier,
            clientId,
            clientSecret
          });

          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<h1>OAuth success</h1><p>Token exchange completed. You can close this tab.</p>');

          console.log('\nOAuth token exchange completed.');
          console.log('Access token:', exchangedTokenSet.accessToken || '<missing>');
          console.log('Refresh token:', exchangedTokenSet.refreshToken || '<missing>');
          console.log('Expires at:', exchangedTokenSet.expiresAt || '<unknown>');

          finish(null, exchangedTokenSet);
        } catch (error) {
          res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
          res.end(`<h1>OAuth test failed</h1><pre>${String(error.message || error)}</pre>`);
          finish(error);
        }
      })();
    });

    let timer = null;
    let settled = false;

    function finish(error, value) {
      if (settled) {
        return;
      }
      settled = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      server.close(() => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    }

    server.on('error', (error) => {
      finish(error);
    });

    timer = setTimeout(() => {
      finish(new Error(`Timed out waiting for OAuth callback after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    server.listen(port, '127.0.0.1', () => {
      console.log(`Local OAuth callback server listening on http://localhost:${port}`);

      if (noOpen) {
        console.log('Browser auto-open disabled (--no-open). Open the Authorization URL manually.\n');
        return;
      }

      try {
        openBrowser(authorizationUrl);
        console.log('Opened browser for OAuth authorization.\n');
      } catch (error) {
        console.log(`Could not open browser automatically (${error.message || error}). Open the Authorization URL manually.\n`);
      }
    });
  });

  return tokenSet;
}

async function runLiveAssertions({ target, clientId, clientSecret, tokenSet }) {
  const client = createZeyosClient({
    platform: {
      origin: target.origin,
      instance: target.instance
    },
    auth: {
      mode: 'oauth',
      oauth: {
        clientId,
        clientSecret,
        token: tokenSet,
        autoRefresh: false
      }
    }
  });

  const checks = [
    {
      name: 'oauth2.getUserInfo returns current user',
      run: async () => {
        const user = await client.oauth2.getUserInfo();
        if (!isObject(user) || !user.sub) {
          throw new Error('Expected user object with `sub`.');
        }
      }
    },
    {
      name: 'api.getConfig returns API configuration',
      run: async () => {
        const config = await client.api.getConfig();
        if (!isObject(config)) {
          throw new Error('Expected object response from getConfig.');
        }
      }
    }
  ];

  console.log('\nRunning live API checks...');

  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`✔ ${check.name}`);
    } catch (error) {
      failed += 1;
      console.log(`✖ ${check.name}`);
      console.log(`  ${error.message || error}`);
    }
  }

  if (failed > 0) {
    throw new Error(`${failed} live check(s) failed.`);
  }

  console.log('✔ Live checks completed successfully.');
}

function normalizeStoredToken(token) {
  if (!isObject(token)) {
    return null;
  }

  const accessToken = token.accessToken ?? token.access_token ?? null;
  const refreshToken = token.refreshToken ?? token.refresh_token ?? null;

  if (!accessToken && !refreshToken) {
    return null;
  }

  return {
    tokenType: token.tokenType ?? token.token_type ?? 'Bearer',
    accessToken,
    refreshToken,
    expiresAt: token.expiresAt ?? token.expires_at ?? null,
    obtainedAt: token.obtainedAt ?? token.obtained_at ?? null
  };
}

async function tryReuseStoredToken({ target, clientId, clientSecret, storedToken }) {
  const normalized = normalizeStoredToken(storedToken);
  if (!normalized?.refreshToken) {
    return null;
  }

  const client = createZeyosClient({
    platform: {
      origin: target.origin,
      instance: target.instance
    },
    auth: {
      mode: 'oauth',
      oauth: {
        clientId,
        clientSecret,
        token: normalized
      }
    }
  });

  try {
    const refreshed = await client.oauth2.refreshToken({
      refreshToken: normalized.refreshToken,
      clientId,
      clientSecret
    });
    console.log('Reused stored refresh token from config.test.json.');
    return refreshed;
  } catch (error) {
    console.log(`Stored refresh token could not be reused (${error.message || error}). Falling back to browser OAuth.`);
    return null;
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config.test.json');

const { known, passthrough } = parseArgs(process.argv.slice(2));
const loadedConfig = await loadTestConfig(CONFIG_PATH);
const liveConfig = isObject(loadedConfig.live) ? loadedConfig.live : {};

let url = known.url ?? process.env.npm_config_url ?? null;
let instance = known.instance ?? process.env.npm_config_instance ?? null;
const clientIdArg = known.clientId ?? process.env.npm_config_client_id ?? process.env.ZEYOS_CLIENT_ID ?? liveConfig.clientId ?? null;
const clientSecretArg = known.clientSecret ?? process.env.npm_config_client_secret ?? process.env.ZEYOS_CLIENT_SECRET ?? liveConfig.clientSecret ?? null;

if (known.live && !url && !instance) {
  url = liveConfig.url ?? null;
  instance = liveConfig.instance ?? null;
}

const hasUrl = Boolean(url);
const hasInstance = Boolean(instance);

if (hasUrl && hasInstance) {
  console.error('Use either --url <full-instance-url> or --instance <instance-id>, not both.');
  process.exit(1);
}

const wantsLiveOAuth = hasUrl || hasInstance;
const port = known.port ?? process.env.npm_config_port ?? (wantsLiveOAuth ? liveConfig.port ?? null : null);

if (known.live && !wantsLiveOAuth) {
  console.error('--live requires live.url or live.instance in config.test.json (or explicit --url/--instance).');
  process.exit(1);
}

if (!wantsLiveOAuth && port) {
  console.error('--port requires --url or --instance.');
  process.exit(1);
}

if (wantsLiveOAuth && !port) {
  console.error('Live OAuth test requires --port, e.g. npm test -- --instance demo --port 8080');
  process.exit(1);
}

let liveTarget = null;
if (hasUrl) {
  try {
    liveTarget = parseTargetFromUrl(String(url));
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
} else if (hasInstance) {
  const instanceId = String(instance).trim();
  if (!instanceId) {
    console.error('--instance must not be empty.');
    process.exit(1);
  }
  liveTarget = {
    origin: 'https://cloud.zeyos.com',
    instance: instanceId,
    instanceUrl: `https://cloud.zeyos.com/${encodeURIComponent(instanceId)}`
  };
}

const livePort = port != null ? parsePositivePort(port) : null;
if (wantsLiveOAuth && livePort == null) {
  console.error('--port must be an integer between 1 and 65535.');
  process.exit(1);
}

runOrExit(process.execPath, [path.join(ROOT, 'scripts/generate-client.mjs')], { cwd: ROOT });

const testFiles = collectTestFiles(path.join(ROOT, 'test'));
runOrExit(process.execPath, ['--test', ...passthrough, ...testFiles], { cwd: ROOT, env: process.env });

if (wantsLiveOAuth) {
  const resolvedClientId = await promptForClientId(clientIdArg);
  let cachedClientSecret = clientSecretArg || null;
  const storedToken = liveConfig.token;

  async function getClientSecret() {
    if (cachedClientSecret) {
      return cachedClientSecret;
    }
    cachedClientSecret = await promptForClientSecret(null);
    return cachedClientSecret;
  }

  try {
    let tokenSet = null;

    if (cachedClientSecret && storedToken) {
      tokenSet = await tryReuseStoredToken({
        target: liveTarget,
        clientId: resolvedClientId,
        clientSecret: cachedClientSecret,
        storedToken
      });
    }

    if (!tokenSet) {
      tokenSet = await runInteractiveOAuthLiveTest({
        target: liveTarget,
        port: livePort,
        clientId: resolvedClientId,
        getClientSecret,
        noOpen: known.noOpen
      });
    }

    const resolvedClientSecret = await getClientSecret();

    await runLiveAssertions({
      target: liveTarget,
      clientId: resolvedClientId,
      clientSecret: resolvedClientSecret,
      tokenSet
    });

    if (!known.noSaveConfig) {
      const nextConfig = {
        ...loadedConfig,
        live: {
          ...liveConfig,
          url: liveTarget.instanceUrl,
          instance: liveTarget.instance,
          port: livePort,
          clientId: resolvedClientId,
          clientSecret: resolvedClientSecret,
          token: {
            accessToken: tokenSet.accessToken ?? null,
            refreshToken: tokenSet.refreshToken ?? null,
            expiresAt: tokenSet.expiresAt ?? null,
            obtainedAt: tokenSet.obtainedAt ?? null
          }
        }
      };

      await saveTestConfig(CONFIG_PATH, nextConfig);
      console.log(`Saved live test configuration to ${CONFIG_PATH}`);
    }
  } catch (error) {
    console.error(`\nLive OAuth test failed: ${error.message || error}`);
    process.exit(1);
  }
}
