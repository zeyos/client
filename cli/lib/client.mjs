/**
 * Create a configured ZeyOS client from the loaded config.
 * Also provides a helper that persists refreshed tokens back to the config file.
 */
import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';
import { loadConfigWithSource, saveConfig, requireConfig } from './config.mjs';

/** @typedef {import('./types.mjs').CliConfig} CliConfig */

/**
 * Build a ready-to-use ZeyOS API client.
 * Throws a friendly error if required config keys are missing.
 *
 * @param {CliConfig} [overrides]  Extra config values (e.g. from CLI flags)
 * @returns {{ client: ReturnType<typeof createZeyosClient>, config: CliConfig, tokenStore: MemoryTokenStore, configSource: 'local'|'global'|null }}
 */
export function buildClient(overrides = {}) {
  const loaded = loadConfigWithSource();
  const config = { ...loaded.config, ...overrides };
  requireConfig(['baseUrl', 'clientId', 'clientSecret', 'accessToken'], config);

  const tokenStore = new MemoryTokenStore({
    accessToken:           config.accessToken,
    refreshToken:          config.refreshToken,
    expiresAt:             config.expiresAt,
    refreshTokenExpiresAt: config.refreshTokenExpiresAt,
  });

  const client = createZeyosClient({
    platform: config.baseUrl,
    auth: {
      mode: 'oauth',
      oauth: {
        clientId:     config.clientId,
        clientSecret: config.clientSecret,
        tokenStore,
        autoRefresh:  true,
      },
    },
  });

  return { client, config, tokenStore, configSource: loaded.source };
}

/**
 * Persist any refreshed tokens back to the credential store.
 * Call this after API operations to keep tokens up-to-date.
 *
 * @param {MemoryTokenStore} tokenStore
 * @param {'local'|'global'|null} scope
 */
export async function syncTokens(tokenStore, scope = 'local') {
  if (!scope) {
    return;
  }
  try {
    const ts = await tokenStore.get();
    if (ts?.accessToken) {
      saveConfig({
        accessToken:           ts.accessToken,
        refreshToken:          ts.refreshToken,
        expiresAt:             ts.expiresAt,
        refreshTokenExpiresAt: ts.refreshTokenExpiresAt,
      }, scope);
    }
  } catch {
    // non-critical
  }
}
