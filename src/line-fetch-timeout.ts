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
 *
 * timeout 必須持續到 SDK 消費完 Response body；因此不能在 nativeFetch
 * resolve 後立即清除 timer。SDK 的 JSON 路徑會呼叫 response.text()，
 * 所以在 text()/json() 完成後才釋放 timeout。
 *
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
  let timeoutReleased = false;

  const releaseTimeout = () => {
    if (timeoutReleased) return;
    timeoutReleased = true;
    clearTimeout(timeout);
    removeAbortListener?.();
  };

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

    const response = await nativeFetch(input, {
      ...init,
      signal: controller.signal,
    });

    const originalText = response.text.bind(response);
    response.text = async () => {
      try {
        return await originalText();
      } finally {
        releaseTimeout();
      }
    };

    const originalJson = response.json.bind(response);
    response.json = async () => {
      try {
        return await originalJson();
      } finally {
        releaseTimeout();
      }
    };

    return response;
  } catch (error) {
    releaseTimeout();
    throw error;
  }
};
