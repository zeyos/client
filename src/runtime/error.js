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
