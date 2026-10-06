/**
 * JSON fetch for patchy mobile data: every attempt has a timeout, and network
 * errors, timeouts, unreadable bodies and transient statuses (408, 429, 5xx)
 * are retried with backoff. A missing file (404) fails at once. Worker-safe.
 */
export class FetchError extends Error {
  constructor(
    message: string,
    /** HTTP status, or null for network errors and timeouts. */
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchJsonOptions {
  /** Total attempts, including the first. */
  attempts?: number;
  /** Per-attempt timeout (ms). */
  timeoutMs?: number;
}

const BACKOFF_MS = [600, 1500, 3500];

const isTransient = (status: number) => status === 408 || status === 429 || status >= 500;

/** "chunks/0_0.json" from a full URL, so error messages stay readable on a phone. */
const label = (url: string) => url.split(/[?#]/)[0]!.split("/").slice(-2).join("/");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson<T>(url: string, { attempts = 4, timeoutMs = 20_000 }: FetchJsonOptions = {}): Promise<T> {
  let lastError = new FetchError(`${label(url)}: not requested`);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length) - 1]!);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        lastError = new FetchError(`${label(url)}: HTTP ${res.status}`, res.status);
        if (isTransient(res.status)) continue;
        throw lastError;
      }
      return (await res.json()) as T;
    } catch (error) {
      if (error === lastError) throw error;
      const reason = controller.signal.aborted ? `timed out after ${Math.round(timeoutMs / 1000)} s` : (error as Error).message;
      lastError = new FetchError(`${label(url)}: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
