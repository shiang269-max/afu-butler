const LINE_API_HOSTS = new Set([
  'api.line.me',
  'api-data.line.me',
]);

const LINE_REQUEST_TIMEOUT_MS = 10_000;

const nativeFetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis);
type FetchInput = Parameters<typeof nativeFetch>[0];
type FetchInit = Parameters<typeof nativeFetch>[1];

function getRequestUrl(input: FetchInput): URL | null {
  try {
    if (typeof input === 'string') return new URL(input);
    if (input instanceof URL) return input;
    return new URL(input.url);
  } catch {
    return null;
  }
}

function isLineApiRequest(input: FetchInput): boolean {
  const url = getRequestUrl(input);
  return url !== null && LINE_API_HOSTS.has(url.hostname);
}

/**
 * LINE SDK v11 使用 runtime 原生 fetch，沒有直接的 timeout 設定。
 * 只對 LINE API 網域加入 AbortController，避免單一 LINE HTTP 請求永久掛住。
 * 不重試，避免 replyMessage / pushMessage 在 timeout 後造成重複送出。
 */
globalThis.fetch = async function lineTimeoutFetch(
  input: FetchInput,
  init?: FetchInit,
): Promise<Response> {
  if (!isLineApiRequest(input)) {
    return nativeFetch(input, init);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`LINE API request timeout after ${LINE_REQUEST_TIMEOUT_MS}ms`));
  }, LINE_REQUEST_TIMEOUT_MS);

  let removeAbortListener: (() => void) | undefined;

  try {
    const originalSignal = init?.signal;

    if (originalSignal) {
      if (originalSignal.aborted) {
        controller.abort(originalSignal.reason);
      } else {
        const onAbort = () => controller.abort(originalSignal.reason);
        originalSignal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () => originalSignal.removeEventListener('abort', onAbort);
      }
    }

    return await nativeFetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    removeAbortListener?.();
  }
};
