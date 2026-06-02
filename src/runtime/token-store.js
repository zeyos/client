function toNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

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

export function tokenResponseToTokenSet(tokenResponse) {
  return normalizeTokenSet(tokenResponse);
}

export class MemoryTokenStore {
  constructor(initialToken = null) {
    this.token = normalizeTokenSet(initialToken);
  }

  async get() {
    return this.token;
  }

  async set(token) {
    this.token = normalizeTokenSet(token);
  }
}
