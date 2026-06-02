/**
 * zeyos logout
 *
 * Revokes the current access token (best-effort) and removes stored tokens
 * from the credential file.  Connection params (baseUrl, clientId, clientSecret)
 * are kept so a subsequent `zeyos login` works without re-entering them.
 *
 * Options:
 *   --global    Clear the global credentials file
 */

import { createZeyosClient, MemoryTokenStore } from '@zeyos/client';
import { loadConfig, clearTokens }             from '../lib/config.mjs';
import { success, warn, info }                 from '../lib/output.mjs';

export const USAGE = `\
Usage: zeyos logout [options]

Revoke the current session and clear stored tokens.

Options:
  --global    Target the global credentials file
  -h, --help  Show this help
`;

export async function run(values) {
  const scope  = values.global ? 'global' : 'local';
  const config = loadConfig();

  if (!config.accessToken) {
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

  clearTokens(scope);
  success('Logged out.');
}
