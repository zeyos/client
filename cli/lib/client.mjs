/**
 * Create a configured ZeyOS client from the loaded config.
 * Also provides a helper that persists refreshed tokens back to the config file.
 */
import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';
import { loadConfigWithSource, persistTokens, requireConfig, listProfiles } from './config.mjs';

/** @typedef {import('./types.mjs').CliConfig} CliConfig */

/**
 * Build a ready-to-use ZeyOS API client.
 * Throws a friendly error if required config keys are missing.
 *
 * @param {CliConfig} [overrides]  Extra config values (e.g. from CLI flags)
 * @param {{ profile?: string }} [opts]  Profile selector (from --profile / ZEYOS_PROFILE)
 * @returns {{ client: ReturnType<typeof createZeyosClient>, config: CliConfig, tokenStore: MemoryTokenStore, configSource: import('./config.mjs').ConfigSource|null }}
 */
export function buildClient(overrides = {}, opts = {}) {
  const loaded = loadConfigWithSource({ profile: opts.profile });
  if (loaded.profile?.missing) {
    const names = Object.keys(listProfiles().profiles);
    const known = names.length ? `Known profiles: ${names.join(', ')}.` : 'No profiles defined yet — create one with `zeyos profile add <name>`.';
    throw new Error(`Profile "${loaded.profile.name}" not found (selected via ${loaded.profile.origin}). ${known}`);
  }
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
 * Persist any refreshed tokens back to the credential store the config came from
 * (a named profile, the legacy local auth.json, or the legacy global file).
 * Call this after API operations to keep tokens up-to-date.
 *
 * @param {MemoryTokenStore} tokenStore
 * @param {import('./config.mjs').ConfigSource|'local'|'global'|null} source
 */
export async function syncTokens(tokenStore, source = 'local') {
  if (!source) {
    return;
  }
  // Back-compat: a bare 'local'/'global' string still works.
  const resolved = typeof source === 'string' ? { kind: source } : source;
  try {
    const ts = await tokenStore.get();
    if (ts?.accessToken) {
      persistTokens(resolved, {
        accessToken:           ts.accessToken,
        refreshToken:          ts.refreshToken,
        expiresAt:             ts.expiresAt,
        refreshTokenExpiresAt: ts.refreshTokenExpiresAt,
      });
    }
  } catch {
    // non-critical
  }
}
