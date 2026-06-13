function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function encodePrimitive(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function appendQueryValue(search, key, value) {
  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(search, key, item);
    }
    return;
  }

  if (isPlainObject(value)) {
    search.append(key, JSON.stringify(value));
    return;
  }

  search.append(key, encodePrimitive(value));
}

function buildQueryString(query = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    appendQueryValue(search, key, value);
  }
  return search.toString();
}

function applyPathParams(pathTemplate, pathParams = {}) {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_, token) => {
    if (!Object.prototype.hasOwnProperty.call(pathParams, token)) {
      throw new Error(`Missing path parameter: ${token}`);
    }
    const rawValue = pathParams[token];
    if (rawValue == null) {
      throw new Error(`Path parameter cannot be null: ${token}`);
    }
    return encodeURIComponent(String(rawValue));
  });
}

export function buildUrl(baseUrl, pathTemplate, pathParams = {}, query = {}) {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
  const resolvedPath = applyPathParams(pathTemplate, pathParams);
  const normalizedPath = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`;

  const rawUrl = `${normalizedBase}${normalizedPath}`;
  const queryString = buildQueryString(query);

  return queryString ? `${rawUrl}?${queryString}` : rawUrl;
}

function valueToFormValues(value) {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => valueToFormValues(item));
  }

  if (isPlainObject(value)) {
    return [JSON.stringify(value)];
  }

  return [encodePrimitive(value)];
}

function toFormUrlEncoded(value) {
  const search = new URLSearchParams();
  if (!value || typeof value !== 'object') {
    return search.toString();
  }

  for (const [key, rawValue] of Object.entries(value)) {
    for (const part of valueToFormValues(rawValue)) {
      search.append(key, part);
    }
  }

  return search.toString();
}

function headersToObject(headers) {
  const result = {};
  for (const [key, value] of headers.entries()) {
    result[key] = value;
  }
  return result;
}

async function parseResponseBody(response, method) {
  if (method === 'HEAD' || response.status === 204 || response.status === 205 || response.status === 304) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = /(^|\b|;)application\/([a-z0-9.+-]*\+)?json\b/i.test(contentType);

  if (!isJson) {
    return text;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function httpRequest({
  fetchImpl,
  url,
  method,
  headers = {},
  body,
  bodyType,
  signal,
  credentials
}) {
  const requestHeaders = new Headers(headers);
  let payload;

  if (body != null) {
    if (bodyType === 'form') {
      if (!requestHeaders.has('content-type')) {
        requestHeaders.set('content-type', 'application/x-www-form-urlencoded');
      }
      payload = toFormUrlEncoded(body);
    } else if (bodyType === 'json') {
      if (!requestHeaders.has('content-type')) {
        requestHeaders.set('content-type', 'application/json');
      }
      payload = JSON.stringify(body);
    } else {
      payload = body;
    }
  }

  const response = await fetchImpl(url, {
    method,
    headers: requestHeaders,
    body: payload,
    signal,
    credentials
  });

  const data = await parseResponseBody(response, method);

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: headersToObject(response.headers),
    data,
    response
  };
}
