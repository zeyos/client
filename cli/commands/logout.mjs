/**
 * zeyos logout
 *
 * Revokes the current access token (best-effort) and clears the selected
 * stored session. Local legacy credentials are cleared completely so a
 * subsequent `zeyos login` starts from fresh connection parameters.
 *
 * Options:
 *   --global    Clear the global credentials file
 */

import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';
import {
  loadConfigWithSource,
  loadGlobalConfig,
  clearTokensForSource,
  clearLocalCredentialsForSource,
  listProfiles
} from '../lib/config.mjs';
import { success, warn, info, error }          from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos logout [options]

Revoke the current session and clear stored credentials.

Options:
  --profile <name>  Log out of a specific profile
  --global          Target the legacy global credentials file
  -h, --help        Show this help
`;

export async function run(values) {
  let config;
  let source;

  if (values.global) {
    config = loadGlobalConfig();
    source = { kind: 'global' };
  } else {
    const loaded = loadConfigWithSource({ profile: values.profile });
    if (loaded.profile?.missing) {
      const names = Object.keys(listProfiles().profiles);
      const known = names.length ? `Known profiles: ${names.join(', ')}.` : 'No profiles defined yet.';
      error(`Profile "${loaded.profile.name}" not found (selected via ${loaded.profile.origin}). ${known}`);
      process.exit(1);
    }
    config = loaded.config;
    source = loaded.source;
  }

  if (!config.accessToken) {
    if (source?.kind === 'local' && clearLocalCredentialsForSource(source)) {
      success('Logged out (local credentials).');
      return;
    }
    warn('Not currently logged in.');
    return;
  }

  // Best-effort token revocation
  if (config.baseUrl && config.clientId && config.clientSecret) {
    try {
      const tokenStore = new MemoryTokenStore({
        accessToken:  config.accessToken,
        refreshToken: config.refreshToken,
      });
      const client = createZeyosClient({
        platform: config.baseUrl,
        auth: {
          mode: 'oauth',
          oauth: {
            clientId:     config.clientId,
            clientSecret: config.clientSecret,
            tokenStore,
            autoRefresh:  false,
          },
        },
      });
      info('Revoking token…');
      await client.oauth2.revokeToken({ token: config.accessToken });
    } catch {
      // Revocation failure is non-fatal — we still clear local tokens
    }
  }

  if (source?.kind === 'local') {
    clearLocalCredentialsForSource(source);
  } else {
    clearTokensForSource(source);
  }
  const where = source?.kind === 'profile' ? `profile "${source.name}"` : (values.global ? 'global credentials' : 'local credentials');
  success(`Logged out (${where}).`);
}
