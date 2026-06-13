export class ZeyosApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ZeyosApiError';

    this.status = details.status ?? 0;
    this.statusText = details.statusText ?? '';
    this.headers = details.headers ?? {};
    this.body = details.body ?? null;
    this.method = details.method ?? '';
    this.url = details.url ?? '';
    this.operationId = details.operationId ?? '';
    this.service = details.service ?? '';
    this.cause = details.cause;
  }
}

/**
 * Thrown by pre-flight validation (when `validate: true` is enabled) before a
 * request is sent. Carries structured, self-correcting hints for agents.
 */
export class ZeyosValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ZeyosValidationError';
    this.operationId = details.operationId ?? '';
    this.errors = Array.isArray(details.errors) ? details.errors : [];
  }
}
