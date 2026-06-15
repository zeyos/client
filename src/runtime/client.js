import { GENERATED, SERVICES, SERVICE_KEYS } from '../generated/operations.js';
import { SCHEMA } from '../generated/schema.js';
import { ZeyosApiError, ZeyosValidationError } from './error.js';
import { buildUrl, httpRequest } from './http.js';
import {
  OBJECT_CONTROL_KEYS as OBJECT_CONTROL_KEY_LIST,
  REQUEST_CONTROL_KEYS
} from './request-shape.js';
import { createSchema } from './schema.js';
import { suggestClosest } from './suggest.js';
import { MemoryTokenStore, normalizeTokenSet, tokenResponseToTokenSet } from './token-store.js';

const DEFAULT_RETRY = Object.freeze({
  maxRetries: 2,
  retryOn: Object.freeze([429, 503]),
  baseDelayMs: 300,
  maxDelayMs: 10000
});

function normalizeRetry(retry) {
  if (retry === false || retry === null) {
    return { maxRetries: 0, retryOn: new Set(), baseDelayMs: 0, maxDelayMs: 0 };
  }
  const cfg = retry && typeof retry === 'object' ? retry : {};
  const retryOn = Array.isArray(cfg.retryOn) ? cfg.retryOn : DEFAULT_RETRY.retryOn;
  return {
    maxRetries: Number.isInteger(cfg.maxRetries) && cfg.maxRetries >= 0 ? cfg.maxRetries : DEFAULT_RETRY.maxRetries,
    retryOn: new Set(retryOn),
    baseDelayMs: Number(cfg.baseDelayMs) > 0 ? Number(cfg.baseDelayMs) : DEFAULT_RETRY.baseDelayMs,
    maxDelayMs: Number(cfg.maxDelayMs) > 0 ? Number(cfg.maxDelayMs) : DEFAULT_RETRY.maxDelayMs
  };
}

function abortableDelay(ms, signal) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('Aborted'));
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

// Honor a Retry-After header (seconds or HTTP-date), else exponential backoff
// with jitter, capped at maxDelayMs.
function computeRetryDelay(response, attempt, retryConfig) {
  const header = response.headers?.['retry-after'];
  if (header != null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return Math.min(retryConfig.maxDelayMs, Math.max(0, seconds * 1000));
    }
    const dateMs = Date.parse(header);
    if (Number.isFinite(dateMs)) {
      return Math.min(retryConfig.maxDelayMs, Math.max(0, dateMs - Date.now()));
    }
  }
  const exp = retryConfig.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * retryConfig.baseDelayMs;
  return Math.min(retryConfig.maxDelayMs, exp + jitter);
}

const AUTH_SCHEME_MAP = Object.freeze({
  oauth: 'bearer',
  token: 'bearer',
  session: 'session',
  basic: 'basic'
});
const PLATFORM_PRESETS = Object.freeze({
  live: 'https://cloud.zeyos.com'
});

const VALID_AUTH_MODES = new Set(['auto', 'oauth', 'session', 'none']);
const RESERVED_INPUT_KEYS = new Set(REQUEST_CONTROL_KEYS);

// Reserved keys that act as control *containers* and are only meaningful when
// object-valued. A scalar value for one of these (most commonly `query: 'term'`
// for ZeyOS full-text search) is a payload field, not a control directive, so it
// must not disable body inference or be excluded from the inferred body.
const OBJECT_CONTROL_KEYS = new Set(OBJECT_CONTROL_KEY_LIST);

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function cloneValue(value) {
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return value;
  }
  return structuredClone(value);
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function toBase64(value) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }

  if (typeof btoa === 'function') {
    return btoa(value);
  }

  throw new Error('No base64 encoder available in this runtime.');
}

function normalizeAuthMode(value, fallback = 'auto') {
  if (value && VALID_AUTH_MODES.has(value)) {
    return value;
  }
  return fallback;
}

function parsePlatformUrl(value) {
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);

    const instance = segments.length === 1 ? decodeURIComponent(segments[0]) : null;
    return {
      origin: parsed.origin,
      instance
    };
  } catch {
    return null;
  }
}

function normalizePlatform(platform) {
  if (!platform) {
    return null;
  }

  if (typeof platform === 'string') {
    if (PLATFORM_PRESETS[platform]) {
      return {
        origin: PLATFORM_PRESETS[platform],
        instance: null
      };
    }

    const parsed = parsePlatformUrl(platform);
    if (parsed) {
      return parsed;
    }

    return {
      origin: platform,
      instance: null
    };
  }

  if (!isObject(platform)) {
    return null;
  }

  const preset = typeof platform.preset === 'string' ? platform.preset : null;
  const directOrigin = typeof platform.origin === 'string' ? platform.origin : null;
  const directUrl = typeof platform.url === 'string' ? platform.url : null;
  const parsedUrl = directUrl ? parsePlatformUrl(directUrl) : null;

  return {
    origin: directOrigin ?? parsedUrl?.origin ?? (preset && PLATFORM_PRESETS[preset] ? PLATFORM_PRESETS[preset] : null),
    instance: typeof platform.instance === 'string' ? platform.instance : parsedUrl?.instance ?? null
  };
}

function mergeHeaders(...sources) {
  const merged = new Headers();
  for (const source of sources) {
    if (!source) {
      continue;
    }
    const headers = source instanceof Headers ? source : new Headers(source);
    for (const [key, value] of headers.entries()) {
      merged.set(key, value);
    }
  }
  return merged;
}

function isSuccessfulHttpStatus(status) {
  return Number.isInteger(status) && status >= 200 && status < 400;
}

function securitySchemesFromOperation(operation) {
  const security = Array.isArray(operation.security) ? operation.security : [];
  if (security.length === 0) {
    return ['none'];
  }

  const schemes = [];
  for (const requirement of security) {
    const keys = Object.keys(requirement || {});
    if (keys.length === 0) {
      if (!schemes.includes('none')) {
        schemes.push('none');
      }
      continue;
    }

    for (const key of keys) {
      const mapped = AUTH_SCHEME_MAP[key];
      if (mapped && !schemes.includes(mapped)) {
        schemes.push(mapped);
      }
    }
  }

  return schemes.length > 0 ? schemes : ['none'];
}

function shouldInferBody(operation, input) {
  if (!Array.isArray(operation.requestContentTypes) || operation.requestContentTypes.length === 0) {
    return false;
  }

  for (const key of RESERVED_INPUT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      continue;
    }
    // Object-container control keys only disable inference when actually
    // object-valued; a scalar (e.g. query: 'acme') is a payload field.
    if (OBJECT_CONTROL_KEYS.has(key) && !isObject(input[key])) {
      continue;
    }
    return false;
  }

  return true;
}

function prepareOperationInput(operation, inputValue) {
  const input = isObject(inputValue) ? inputValue : {};
  const pathParams = isObject(input.path) ? { ...input.path } : {};
  const query = isObject(input.query) ? { ...input.query } : {};
  const headers = isObject(input.headers) ? { ...input.headers } : {};
  const consumedInputKeys = new Set(RESERVED_INPUT_KEYS);
  // Scalar object-container keys (e.g. query: 'acme') are payload fields, so do
  // not pre-exclude them from the inferred body. A declared path/query/header
  // parameter of the same name is still routed correctly by the loops below.
  for (const key of OBJECT_CONTROL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key) && !isObject(input[key])) {
      consumedInputKeys.delete(key);
    }
  }

  for (const name of operation.parameterNames.path) {
    if (!Object.prototype.hasOwnProperty.call(pathParams, name) && Object.prototype.hasOwnProperty.call(input, name)) {
      pathParams[name] = input[name];
    }
    if (Object.prototype.hasOwnProperty.call(input, name)) {
      consumedInputKeys.add(name);
    }
  }

  for (const name of operation.parameterNames.query) {
    if (!Object.prototype.hasOwnProperty.call(query, name) && Object.prototype.hasOwnProperty.call(input, name)) {
      query[name] = input[name];
    }
    if (Object.prototype.hasOwnProperty.call(input, name)) {
      consumedInputKeys.add(name);
    }
  }

  for (const name of operation.parameterNames.header) {
    if (!Object.prototype.hasOwnProperty.call(headers, name) && Object.prototype.hasOwnProperty.call(input, name)) {
      headers[name] = input[name];
    }
    if (Object.prototype.hasOwnProperty.call(input, name)) {
      consumedInputKeys.add(name);
    }
  }

  let body;
  if (Object.prototype.hasOwnProperty.call(input, 'body')) {
    body = input.body;
  } else if (Object.prototype.hasOwnProperty.call(input, 'data')) {
    body = input.data;
  } else if (shouldInferBody(operation, input)) {
    body = {};
    for (const [key, value] of Object.entries(input)) {
      if (!consumedInputKeys.has(key)) {
        body[key] = value;
      }
    }
    if (Object.keys(body).length === 0) {
      body = undefined;
    }
  } else if (Array.isArray(operation.requestContentTypes) && operation.requestContentTypes.length > 0) {
    // Body inference was skipped because a reserved control key is present in the
    // input (shouldInferBody returned false). Any remaining input fields that are
    // not reserved control keys and not path/query/header parameters would have
    // become the request body, but are now silently dropped. Surface that clearly
    // instead of sending a request that omits the caller's payload.
    const collidingReservedKeys = [];
    for (const key of RESERVED_INPUT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        collidingReservedKeys.push(key);
      }
    }

    const orphanedFields = Object.keys(input).filter((key) => !consumedInputKeys.has(key));

    if (orphanedFields.length > 0) {
      const operationLabel = operation.operationId || `${operation.method} ${operation.path}`;
      throw new ZeyosApiError(
        `${operationLabel}: payload field(s) ${orphanedFields.map((field) => `"${field}"`).join(', ')} ` +
          `would be dropped because the reserved key(s) ${collidingReservedKeys
            .map((key) => `"${key}"`)
            .join(', ')} disabled body inference. ` +
          'Wrap payload fields in an explicit `body: { ... }` (or `data: { ... }`).',
        {
          operationId: operation.operationId,
          method: operation.method,
          url: operation.path
        }
      );
    }
  }

  return {
    pathParams,
    query,
    headers,
    body,
    bodyType: input.bodyType,
    auth: input.auth,
    signal: input.signal,
    raw: input.raw,
    baseUrl: input.baseUrl
  };
}

function chooseBodyType(serviceKey, operation, prepared, fallbackBodyType) {
  const body = prepared.body;
  if (body == null) {
    return undefined;
  }

  const explicitType = prepared.bodyType ?? fallbackBodyType;
  if (explicitType) {
    return explicitType;
  }

  const contentTypes = operation.requestContentTypes || [];

  if ((serviceKey === 'oauth2' || serviceKey === 'legacyAuth') && contentTypes.includes('application/x-www-form-urlencoded')) {
    return 'form';
  }

  if (contentTypes.includes('application/json')) {
    return 'json';
  }

  if (contentTypes.includes('application/x-www-form-urlencoded')) {
    return 'form';
  }

  return undefined;
}

function createApiError(response, { serviceKey, operation, method, url }) {
  const operationDescription = operation.operationId ? `${serviceKey}.${operation.operationId}` : `${serviceKey} request`;
  const message = `${operationDescription} failed with HTTP ${response.status}`;

  return new ZeyosApiError(message, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    body: response.data,
    method,
    url,
    operationId: operation.operationId,
    service: serviceKey
  });
}

function normalizeRequestAuth(auth) {
  if (!auth) {
    return {};
  }
  if (typeof auth === 'string') {
    return { mode: auth };
  }
  return auth;
}

function getBasicCredentials({ body, requestAuth, oauthConfig }) {
  const bodyObject = isObject(body) ? body : {};

  const clientId =
    requestAuth.clientId ??
    requestAuth.client_id ??
    bodyObject.client_id ??
    bodyObject.clientId ??
    oauthConfig.clientId ??
    oauthConfig.client_id;

  const clientSecret =
    requestAuth.clientSecret ??
    requestAuth.client_secret ??
    bodyObject.client_secret ??
    bodyObject.clientSecret ??
    oauthConfig.clientSecret ??
    oauthConfig.client_secret;

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret
  };
}

function resolveBaseUrl({ services, serviceKey, config, explicitBaseUrl }) {
  if (explicitBaseUrl) {
    return trimTrailingSlash(explicitBaseUrl);
  }

  if (isObject(config.baseUrls) && typeof config.baseUrls[serviceKey] === 'string') {
    return trimTrailingSlash(config.baseUrls[serviceKey]);
  }

  const service = services[serviceKey];
  if (!service) {
    throw new Error(`Unknown service key: ${serviceKey}`);
  }

  const template = service.server?.urlTemplate || '';
  const defaults = isObject(service.server?.defaultVariables) ? service.server.defaultVariables : {};
  const platform = normalizePlatform(config.platform);
  const platformInstance = platform?.instance ?? config.instance ?? defaults.INSTANCE;

  if (platform?.origin) {
    const pathTemplate = service.server?.basePathTemplate || '';
    const pathVariables = {
      ...defaults,
      INSTANCE: platformInstance
    };

    const resolvedPath = pathTemplate.replace(/\{([^}]+)\}/g, (_, token) => {
      if (!Object.prototype.hasOwnProperty.call(pathVariables, token)) {
        return `{${token}}`;
      }
      return encodeURIComponent(String(pathVariables[token]));
    });

    const normalizedOrigin = trimTrailingSlash(platform.origin);
    const normalizedPath = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`;
    return trimTrailingSlash(`${normalizedOrigin}${normalizedPath}`);
  }

  const variables = {
    ...defaults,
    INSTANCE: platformInstance
  };

  const resolved = template.replace(/\{([^}]+)\}/g, (_, token) => {
    if (!Object.prototype.hasOwnProperty.call(variables, token)) {
      return `{${token}}`;
    }
    return encodeURIComponent(String(variables[token]));
  });

  return trimTrailingSlash(resolved);
}

function resolveAuthCandidates({ mode, schemes, tokenSet, sessionEnabled }) {
  const has = (scheme) => schemes.includes(scheme);

  if (mode === 'none') {
    return [{ type: 'none' }];
  }

  if (mode === 'oauth') {
    if (has('basic')) {
      return [{ type: 'basic' }];
    }
    if (has('bearer')) {
      return [{ type: 'bearer' }];
    }
    if (has('none')) {
      return [{ type: 'none' }];
    }
    throw new Error('OAuth mode cannot satisfy the operation security requirements.');
  }

  if (mode === 'session') {
    if (has('session')) {
      return [{ type: 'session' }];
    }
    if (has('none')) {
      return [{ type: 'none' }];
    }
    throw new Error('Session mode cannot satisfy the operation security requirements.');
  }

  const candidates = [];
  if (has('basic')) {
    candidates.push({ type: 'basic' });
  }
  if (has('bearer') && tokenSet?.accessToken) {
    candidates.push({ type: 'bearer' });
  }
  if (has('session') && sessionEnabled) {
    candidates.push({ type: 'session' });
  }

  if (candidates.length === 0) {
    if (has('bearer')) {
      candidates.push({ type: 'bearer' });
    } else if (has('session') && sessionEnabled) {
      candidates.push({ type: 'session' });
    } else {
      candidates.push({ type: 'none' });
    }
  }

  return candidates;
}

function canRefreshAccessToken({ mode, operation, tokenSet, oauthConfig }) {
  if (mode !== 'auto' && mode !== 'oauth') {
    return false;
  }

  if (oauthConfig.autoRefresh === false) {
    return false;
  }

  if (!tokenSet?.refreshToken) {
    return false;
  }

  if (operation.operationId === 'getToken') {
    return false;
  }

  return Boolean(oauthConfig.clientId && oauthConfig.clientSecret);
}

function isAccessTokenExpired(tokenSet, skewSeconds = 60) {
  if (!tokenSet?.accessToken || tokenSet.expiresAt == null) {
    return false;
  }
  const expiresAt = Number(tokenSet.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  return expiresAt <= now + skewSeconds;
}

export function createZeyosClient(rawConfig = {}) {
  const config = isObject(rawConfig) ? rawConfig : {};
  const fetchImpl = config.fetch ?? globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch implementation is required (pass config.fetch or run in an environment with global fetch).');
  }

  const authConfig = isObject(config.auth) ? config.auth : {};
  const oauthConfig = isObject(authConfig.oauth) ? authConfig.oauth : {};
  const sessionConfig = isObject(authConfig.session) ? authConfig.session : {};

  const defaultMode = normalizeAuthMode(authConfig.mode, 'auto');
  const sessionEnabled = sessionConfig.enabled !== false;
  const sessionCredentials = sessionConfig.credentials ?? 'include';

  const providedTokenStore = oauthConfig.tokenStore;
  const tokenStore =
    providedTokenStore && typeof providedTokenStore.get === 'function' && typeof providedTokenStore.set === 'function'
      ? providedTokenStore
      : new MemoryTokenStore(oauthConfig.token ?? null);

  const defaultHeaders = isObject(config.headers) ? config.headers : {};
  const retryConfig = normalizeRetry(config.retry);
  const schemaApi = createSchema({ services: SERVICES, schema: SCHEMA });
  const validateByDefault = config.validate === true;
  const operationLookup = new Map();

  for (const [serviceKey, service] of Object.entries(SERVICES)) {
    for (const operation of service.operations) {
      operationLookup.set(`${serviceKey}.${operation.operationId}`, operation);
    }
  }

  async function getTokenSet() {
    return normalizeTokenSet(await tokenStore.get());
  }

  async function setTokenSet(tokenSet) {
    await tokenStore.set(normalizeTokenSet(tokenSet));
  }

  async function clearTokenSet() {
    await tokenStore.set(null);
  }

  async function getSessionCookieHeader() {
    const cookieSource = sessionConfig.cookie;
    const rawCookie = typeof cookieSource === 'function' ? await cookieSource() : cookieSource;

    if (!rawCookie) {
      return null;
    }

    const cookieValue = String(rawCookie);
    if (cookieValue.includes('=')) {
      return cookieValue;
    }

    return `ZEYOSID=${cookieValue}`;
  }

  async function sendRequestOnce({ serviceKey, operation, prepared, requestAuth, tokenSet, candidate, requestOptions }) {
    const body = cloneValue(prepared.body);
    const authHeaders = {};
    let credentials;

    if (candidate.type === 'bearer') {
      const accessToken = requestAuth.accessToken ?? requestAuth.access_token ?? tokenSet?.accessToken;
      if (!accessToken) {
        throw new Error('Missing access token for bearer-authenticated request.');
      }
      authHeaders.authorization = `Bearer ${accessToken}`;
    }

    if (candidate.type === 'basic') {
      const credentialsPair = getBasicCredentials({ body, requestAuth, oauthConfig });
      if (!credentialsPair) {
        throw new Error('Missing client_id/client_secret for basic-authenticated request.');
      }

      authHeaders.authorization = `Basic ${toBase64(`${credentialsPair.clientId}:${credentialsPair.clientSecret}`)}`;

      if (isObject(body)) {
        if (!Object.prototype.hasOwnProperty.call(body, 'client_id')) {
          body.client_id = credentialsPair.clientId;
        }
        if (!Object.prototype.hasOwnProperty.call(body, 'client_secret')) {
          body.client_secret = credentialsPair.clientSecret;
        }
      }
    }

    if (candidate.type === 'session') {
      credentials = sessionCredentials;
      const cookieHeader = await getSessionCookieHeader();
      if (cookieHeader) {
        authHeaders.cookie = cookieHeader;
      }
    }

    const bodyType = chooseBodyType(serviceKey, operation, { ...prepared, body }, requestOptions?.bodyType);
    const headers = mergeHeaders(defaultHeaders, prepared.headers, authHeaders);

    if (!headers.has('accept')) {
      headers.set('accept', 'application/json, text/plain;q=0.9, */*;q=0.8');
    }

    const url = buildUrl(
      resolveBaseUrl({ services: SERVICES, serviceKey, config, explicitBaseUrl: prepared.baseUrl ?? requestOptions?.baseUrl }),
      operation.path,
      prepared.pathParams,
      prepared.query
    );

    const signal = prepared.signal ?? requestOptions?.signal;

    let response;
    for (let attempt = 0; ; attempt++) {
      response = await httpRequest({
        fetchImpl,
        url,
        method: operation.method,
        headers,
        body,
        bodyType,
        signal,
        credentials
      });

      if (attempt >= retryConfig.maxRetries || !retryConfig.retryOn.has(response.status)) {
        break;
      }
      await abortableDelay(computeRetryDelay(response, attempt, retryConfig), signal);
    }

    if (!isSuccessfulHttpStatus(response.status)) {
      throw createApiError(response, {
        serviceKey,
        operation,
        method: operation.method,
        url
      });
    }

    return {
      ...response,
      data: operation.method === 'HEAD' ? true : response.data
    };
  }

  async function refreshAccessToken(currentTokenSet, requestAuth = {}, requestOptions = {}) {
    const refreshToken = requestAuth.refreshToken ?? requestAuth.refresh_token ?? currentTokenSet?.refreshToken;
    if (!refreshToken) {
      return null;
    }

    const credentials = getBasicCredentials({ body: {}, requestAuth, oauthConfig });
    if (!credentials) {
      return null;
    }

    const tokenOperation = operationLookup.get('oauth2.getToken');
    if (!tokenOperation) {
      return null;
    }

    const prepared = {
      pathParams: {},
      query: {},
      headers: {},
      body: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret
      },
      bodyType: 'form',
      signal: requestOptions.signal,
      baseUrl: requestOptions.baseUrl
    };

    const response = await sendRequestOnce({
      serviceKey: 'oauth2',
      operation: tokenOperation,
      prepared,
      requestAuth,
      tokenSet: currentTokenSet,
      candidate: { type: 'basic' },
      requestOptions: { ...requestOptions, bodyType: 'form' }
    });

    const nextTokenSet = tokenResponseToTokenSet(response.data);
    if (!nextTokenSet) {
      return null;
    }

    if (!nextTokenSet.refreshToken && currentTokenSet?.refreshToken) {
      nextTokenSet.refreshToken = currentTokenSet.refreshToken;
    }

    await tokenStore.set(nextTokenSet);
    return nextTokenSet;
  }

  async function executeOperation({ serviceKey, operation, prepared, requestOptions = {} }) {
    const requestAuth = normalizeRequestAuth(prepared.auth ?? requestOptions.auth);
    const mode = normalizeAuthMode(requestAuth.mode, defaultMode);
    const schemes = securitySchemesFromOperation(operation);
    let tokenSet = await getTokenSet();

    if (
      schemes.includes('bearer') &&
      isAccessTokenExpired(tokenSet) &&
      canRefreshAccessToken({ mode, operation, tokenSet, oauthConfig })
    ) {
      try {
        const refreshed = await refreshAccessToken(tokenSet, requestAuth, requestOptions);
        if (refreshed?.accessToken) {
          tokenSet = refreshed;
        }
      } catch {
        // Fall back to the normal request path; a 401 can still trigger refresh.
      }
    }

    const candidates = resolveAuthCandidates({
      mode,
      schemes,
      tokenSet,
      sessionEnabled
    });

    const raw = requestOptions.raw ?? prepared.raw ?? false;
    let lastError;

    for (const candidate of candidates) {
      try {
        const response = await sendRequestOnce({
          serviceKey,
          operation,
          prepared,
          requestAuth,
          tokenSet,
          candidate,
          requestOptions
        });

        return raw ? response : response.data;
      } catch (error) {
        if (!(error instanceof ZeyosApiError) || error.status !== 401) {
          throw error;
        }

        if (candidate.type === 'bearer' && canRefreshAccessToken({ mode, operation, tokenSet, oauthConfig })) {
          try {
            const refreshed = await refreshAccessToken(tokenSet, requestAuth, requestOptions);
            if (refreshed?.accessToken) {
              tokenSet = refreshed;
              const retryResponse = await sendRequestOnce({
                serviceKey,
                operation,
                prepared,
                requestAuth,
                tokenSet,
                candidate,
                requestOptions
              });
              return raw ? retryResponse : retryResponse.data;
            }
          } catch (refreshError) {
            lastError = refreshError;
            continue;
          }
        }

        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Unable to execute request due to missing authentication candidates.');
  }

  function bindService(serviceKey) {
    const service = SERVICES[serviceKey];
    if (!service) {
      return Object.freeze({});
    }

    const namespace = {};
    const operationIds = service.operations.map((operation) => operation.operationId);

    for (const operation of service.operations) {
      namespace[operation.operationId] = async (input, requestOptions) => {
        if (validateByDefault || requestOptions?.validate === true) {
          const result = schemaApi.validate(operation.operationId, input);
          if (!result.valid) {
            throw new ZeyosValidationError(
              `${operation.operationId}: ${result.errors.map((entry) => entry.message).join(' ')}`,
              { operationId: operation.operationId, errors: result.errors }
            );
          }
        }
        const prepared = prepareOperationInput(operation, input);
        return executeOperation({ serviceKey, operation, prepared, requestOptions });
      };
    }

    // Return a helpful "did you mean ...?" error when an agent calls an
    // operation that does not exist (e.g. listDunning vs listDunningNotices),
    // instead of an opaque "x is not a function" TypeError.
    return new Proxy(Object.freeze(namespace), {
      get(target, prop, receiver) {
        if (typeof prop !== 'string' || prop === 'then' || prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        // Async so an unknown operation rejects like a real operation call
        // would, rather than throwing synchronously before `.catch()`/`await`.
        return async () => {
          const suggestion = suggestClosest(prop, operationIds);
          throw new ZeyosApiError(
            `Unknown operation '${serviceKey}.${prop}'.` +
              (suggestion
                ? ` Did you mean '${suggestion}'?`
                : ' Use client.schema.operationIds() to list valid operations.'),
            { operationId: prop, service: serviceKey }
          );
        };
      }
    });
  }

  async function request(input = {}, requestOptions = {}) {
    if (!isObject(input)) {
      throw new Error('client.request input must be an object.');
    }

    const serviceKey = input.service;
    if (!serviceKey || typeof serviceKey !== 'string') {
      throw new Error('client.request requires a service key.');
    }

    if (input.operationId) {
      const operation = operationLookup.get(`${serviceKey}.${input.operationId}`);
      if (!operation) {
        const candidates = (SERVICES[serviceKey]?.operations ?? []).map((entry) => entry.operationId);
        const suggestion = suggestClosest(input.operationId, candidates);
        throw new ZeyosApiError(
          `Unknown operation: ${serviceKey}.${input.operationId}.` + (suggestion ? ` Did you mean '${suggestion}'?` : ''),
          { operationId: input.operationId, service: serviceKey }
        );
      }

      const prepared = {
        pathParams: isObject(input.pathParams) ? input.pathParams : {},
        query: isObject(input.query) ? input.query : {},
        headers: isObject(input.headers) ? input.headers : {},
        body: input.body,
        bodyType: input.bodyType,
        auth: input.auth,
        signal: input.signal,
        raw: input.raw,
        baseUrl: input.baseUrl
      };

      return executeOperation({ serviceKey, operation, prepared, requestOptions });
    }

    if (!input.path || !input.method) {
      throw new Error('client.request requires method and path when operationId is not provided.');
    }

    const operation = {
      operationId: 'request',
      method: String(input.method).toUpperCase(),
      path: String(input.path),
      security: Array.isArray(input.security) ? input.security : [],
      requestContentTypes: Array.isArray(input.requestContentTypes) ? input.requestContentTypes : ['application/json'],
      parameterNames: {
        path: [],
        query: [],
        header: []
      }
    };

    const prepared = {
      pathParams: isObject(input.pathParams) ? input.pathParams : {},
      query: isObject(input.query) ? input.query : {},
      headers: isObject(input.headers) ? input.headers : {},
      body: input.body,
      bodyType: input.bodyType,
      auth: input.auth,
      signal: input.signal,
      raw: input.raw,
      baseUrl: input.baseUrl
    };

    return executeOperation({ serviceKey, operation, prepared, requestOptions });
  }

  const api = bindService('api');
  const oauth2Operations = bindService('oauth2');
  const legacyAuth = bindService('legacyAuth');

  function buildAuthorizationUrl(options = {}) {
    const clientId = options.clientId ?? options.client_id ?? oauthConfig.clientId;
    const redirectUri = options.redirectUri ?? options.redirect_uri;

    if (!clientId) {
      throw new Error('buildAuthorizationUrl requires clientId (or auth.oauth.clientId in client config).');
    }
    if (!redirectUri) {
      throw new Error('buildAuthorizationUrl requires redirectUri.');
    }

    const query = {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: options.responseMode ?? options.response_mode,
      code_challenge: options.codeChallenge ?? options.code_challenge,
      code_challenge_method: options.codeChallengeMethod ?? options.code_challenge_method,
      state: options.state
    };

    if (query.code_challenge && !query.code_challenge_method) {
      query.code_challenge_method = 'S256';
    }

    return buildUrl(
      resolveBaseUrl({ services: SERVICES, serviceKey: 'oauth2', config, explicitBaseUrl: options.baseUrl }),
      '/authorize',
      {},
      query
    );
  }

  function parseAuthorizationCallback(callbackUrl) {
    const url =
      callbackUrl instanceof URL
        ? callbackUrl
        : (() => {
            try {
              return new URL(String(callbackUrl));
            } catch {
              return new URL(String(callbackUrl), 'http://localhost');
            }
          })();

    const params = url.searchParams;

    return {
      code: params.get('code'),
      state: params.get('state'),
      error: params.get('error'),
      errorDescription: params.get('error_description'),
      errorUri: params.get('error_uri'),
      isError: params.has('error')
    };
  }

  async function storeTokenResponse(tokenResponse, store = true) {
    const tokenSet = tokenResponseToTokenSet(tokenResponse);
    if (store && tokenSet) {
      await tokenStore.set(tokenSet);
    }
    return tokenSet || tokenResponse;
  }

  async function exchangeAuthorizationCode(options = {}, requestOptions = {}) {
    const clientId = options.clientId ?? options.client_id ?? oauthConfig.clientId;
    const clientSecret = options.clientSecret ?? options.client_secret ?? oauthConfig.clientSecret;
    const code = options.code;

    if (!code) {
      throw new Error('exchangeAuthorizationCode requires code.');
    }

    const tokenResponse = await request(
      {
        service: 'oauth2',
        operationId: 'getToken',
        body: {
          grant_type: 'authorization_code',
          code,
          code_verifier: options.codeVerifier ?? options.code_verifier,
          redirect_uri: options.redirectUri ?? options.redirect_uri,
          client_id: clientId,
          client_secret: clientSecret
        },
        auth: {
          mode: 'oauth',
          clientId,
          clientSecret
        },
        bodyType: 'form',
        raw: false,
        baseUrl: options.baseUrl
      },
      requestOptions
    );

    return storeTokenResponse(tokenResponse, options.store !== false);
  }

  async function refreshToken(options = {}, requestOptions = {}) {
    const clientId = options.clientId ?? options.client_id ?? oauthConfig.clientId;
    const clientSecret = options.clientSecret ?? options.client_secret ?? oauthConfig.clientSecret;

    const tokenSet = await getTokenSet();
    const refreshTokenValue = options.refreshToken ?? options.refresh_token ?? tokenSet?.refreshToken;

    if (!refreshTokenValue) {
      throw new Error('refreshToken requires refreshToken or a stored token with refreshToken.');
    }

    const tokenResponse = await request(
      {
        service: 'oauth2',
        operationId: 'getToken',
        body: {
          grant_type: 'refresh_token',
          refresh_token: refreshTokenValue,
          client_id: clientId,
          client_secret: clientSecret
        },
        auth: {
          mode: 'oauth',
          clientId,
          clientSecret
        },
        bodyType: 'form',
        baseUrl: options.baseUrl
      },
      requestOptions
    );

    return storeTokenResponse(tokenResponse, options.store !== false);
  }

  async function revokeToken(options = {}, requestOptions = {}) {
    const clientId = options.clientId ?? options.client_id ?? oauthConfig.clientId;
    const clientSecret = options.clientSecret ?? options.client_secret ?? oauthConfig.clientSecret;

    return request(
      {
        service: 'oauth2',
        operationId: 'revokeToken',
        body: {
          token: options.token,
          client_id: clientId,
          client_secret: clientSecret
        },
        auth: {
          mode: 'oauth',
          clientId,
          clientSecret
        },
        bodyType: 'form',
        baseUrl: options.baseUrl
      },
      requestOptions
    );
  }

  async function introspectToken(options = {}, requestOptions = {}) {
    const clientId = options.clientId ?? options.client_id ?? oauthConfig.clientId;
    const clientSecret = options.clientSecret ?? options.client_secret ?? oauthConfig.clientSecret;

    return request(
      {
        service: 'oauth2',
        operationId: 'introspectToken',
        body: {
          token: options.token,
          client_id: clientId,
          client_secret: clientSecret
        },
        auth: {
          mode: 'oauth',
          clientId,
          clientSecret
        },
        bodyType: 'form',
        baseUrl: options.baseUrl
      },
      requestOptions
    );
  }

  const oauth2 = Object.freeze({
    ...oauth2Operations,
    buildAuthorizationUrl,
    parseAuthorizationCallback,
    exchangeAuthorizationCode,
    refreshToken,
    revokeToken,
    introspectToken
  });

  const client = {
    api,
    oauth2,
    legacyAuth,
    request,
    schema: schemaApi,
    auth: {
      getTokenSet,
      setTokenSet,
      clearTokenSet
    },
    metadata: {
      generatedAt: GENERATED.generatedAt,
      services: SERVICE_KEYS
    }
  };

  return Object.freeze(client);
}
