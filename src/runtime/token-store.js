/**
 * @typedef {{
 *   accessToken: string|null,
 *   refreshToken: string|null,
 *   tokenType: string,
 *   expiresIn: number|null,
 *   refreshTokenExpiresIn: number|null,
 *   obtainedAt: number,
 *   expiresAt: number|null,
 *   refreshTokenExpiresAt: number|null
 * }} TokenSet
 *
 * @typedef {{
 *   accessToken?: string|null,
 *   access_token?: string|null,
 *   refreshToken?: string|null,
 *   refresh_token?: string|null,
 *   tokenType?: string|null,
 *   token_type?: string|null,
 *   expiresIn?: number|string|null,
 *   expires_in?: number|string|null,
 *   refreshTokenExpiresIn?: number|string|null,
 *   refresh_token_expires_in?: number|string|null,
 *   obtainedAt?: number|string|null,
 *   obtained_at?: number|string|null,
 *   expiresAt?: number|string|null,
 *   expires_at?: number|string|null,
 *   refreshTokenExpiresAt?: number|string|null,
 *   refresh_token_expires_at?: number|string|null
 * }} TokenSetInput
 */

function toNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {TokenSetInput|null|undefined} input
 * @returns {TokenSet|null}
 */
export function normalizeTokenSet(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const accessToken = input.accessToken ?? input.access_token ?? null;
  const refreshToken = input.refreshToken ?? input.refresh_token ?? null;

  if (!accessToken && !refreshToken) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const obtainedAt = toNumber(input.obtainedAt ?? input.obtained_at) ?? nowSeconds;
  const expiresIn = toNumber(input.expiresIn ?? input.expires_in);
  const refreshTokenExpiresIn = toNumber(input.refreshTokenExpiresIn ?? input.refresh_token_expires_in);

  const expiresAt =
    toNumber(input.expiresAt ?? input.expires_at) ??
    (expiresIn != null ? obtainedAt + expiresIn : null);

  const refreshTokenExpiresAt =
    toNumber(input.refreshTokenExpiresAt ?? input.refresh_token_expires_at) ??
    (refreshTokenExpiresIn != null ? obtainedAt + refreshTokenExpiresIn : null);

  return {
    tokenType: input.tokenType ?? input.token_type ?? 'Bearer',
    accessToken,
    refreshToken,
    expiresIn,
    refreshTokenExpiresIn,
    obtainedAt,
    expiresAt,
    refreshTokenExpiresAt
  };
}

/**
 * @param {TokenSetInput|null|undefined} tokenResponse
 * @returns {TokenSet|null}
 */
export function tokenResponseToTokenSet(tokenResponse) {
  return normalizeTokenSet(tokenResponse);
}

export class MemoryTokenStore {
  /** @param {TokenSetInput|null} [initialToken] */
  constructor(initialToken = null) {
    this.token = normalizeTokenSet(initialToken);
  }

  /** @returns {Promise<TokenSet|null>} */
  async get() {
    return this.token;
  }

  /** @param {TokenSetInput|null} token */
  async set(token) {
    this.token = normalizeTokenSet(token);
  }
}
