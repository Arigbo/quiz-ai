/**
 * Retry utility for Gemini API calls.
 *
 * Gemini returns 503 (UNAVAILABLE) during demand spikes. This helper
 * retries with exponential backoff + jitter before giving up.
 */

const RETRYABLE_MESSAGES = [
  'unavailable',
  '503',
  'service unavailable',
  'high demand',
  'try again',
  'overloaded',
  'resource exhausted',
  '429',
  'rate limit',
];

function isRetryableError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return RETRYABLE_MESSAGES.some((keyword) => msg.includes(keyword));
}

/**
 * Calls `fn` up to `maxAttempts` times, backing off exponentially on
 * retryable errors (503 / 429 / resource exhausted).
 *
 * @param fn           - The async function to retry.
 * @param maxAttempts  - Total attempts including the first (default: 4).
 * @param baseDelayMs  - Initial wait in ms before first retry (default: 1500).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 1500,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLast = attempt === maxAttempts;
      if (isLast || !isRetryableError(error)) {
        throw error;
      }

      // Exponential backoff with ±20% jitter: 1.5s → 3s → 6s
      const delay = baseDelayMs * 2 ** (attempt - 1);
      const jitter = delay * 0.2 * (Math.random() * 2 - 1); // ±20%
      const wait = Math.round(delay + jitter);

      console.warn(
        `[Gemini] Attempt ${attempt}/${maxAttempts} failed (retryable). Retrying in ${wait}ms…`,
        error instanceof Error ? error.message : error,
      );

      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  throw lastError;
}
