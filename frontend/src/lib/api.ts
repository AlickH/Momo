export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const BASE = import.meta.env.BASE_URL;

interface RequestOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 30000, signal } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  try {
    const response = await fetch(`${BASE}api/${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(['GET', 'HEAD'].includes(method) ? {} : { 'X-Momo-Request': '1' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      const record = (payload && typeof payload === 'object' ? payload : {}) as {
        error?: string;
        code?: string;
        details?: unknown;
      };
      throw new ApiError(record.error || `请求失败（HTTP ${response.status}）`, response.status, record.code, record.details);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('请求超时，请稍后重试', 0);
    }
    throw new ApiError(error instanceof Error ? error.message : '网络请求失败', 0);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', abort);
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
};
