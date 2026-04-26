export interface ParsedRateLimitHeaders {
  requestLimit?: number;
  requestsRemaining?: number;
  requestResetMs?: number;
  tokenLimit?: number;
  tokensRemaining?: number;
  tokenResetMs?: number;
  retryAfterMs?: number;
}

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }
  return undefined;
}

function parseResetToMs(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  // Try as epoch seconds
  const n = Number(value);
  if (Number.isFinite(n)) {
    // If it looks like a unix timestamp (> year 2000 in seconds), treat as epoch seconds
    if (n > 946684800) {
      return Math.max(0, n * 1000 - Date.now());
    }
    // Otherwise treat as seconds-from-now
    return n * 1000;
  }
  // Try as ISO 8601 / HTTP-date
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }
  return undefined;
}

function parseAnthropicOpenAI(headers: Record<string, string | undefined>): ParsedRateLimitHeaders {
  return {
    requestLimit: num(headers["x-ratelimit-limit-requests"]),
    requestsRemaining: num(headers["x-ratelimit-remaining-requests"]),
    requestResetMs: parseResetToMs(headers["x-ratelimit-reset-requests"]),
    tokenLimit: num(headers["x-ratelimit-limit-tokens"]),
    tokensRemaining: num(headers["x-ratelimit-remaining-tokens"]),
    tokenResetMs: parseResetToMs(headers["x-ratelimit-reset-tokens"]),
    retryAfterMs: parseRetryAfter(headers["retry-after"]),
  };
}

function parseGemini(headers: Record<string, string | undefined>): ParsedRateLimitHeaders {
  return {
    requestLimit: num(headers["x-ratelimit-limit"]),
    requestsRemaining: num(headers["x-ratelimit-remaining"]),
    requestResetMs: parseResetToMs(headers["x-ratelimit-reset"]),
    retryAfterMs: parseRetryAfter(headers["retry-after"]),
  };
}

function parseGeneric(headers: Record<string, string | undefined>): ParsedRateLimitHeaders {
  // Try detailed headers first (Anthropic/OpenAI style), fall back to simple (Gemini style)
  const result: ParsedRateLimitHeaders = {
    requestLimit: num(headers["x-ratelimit-limit-requests"]) ?? num(headers["x-ratelimit-limit"]),
    requestsRemaining:
      num(headers["x-ratelimit-remaining-requests"]) ?? num(headers["x-ratelimit-remaining"]),
    requestResetMs:
      parseResetToMs(headers["x-ratelimit-reset-requests"]) ??
      parseResetToMs(headers["x-ratelimit-reset"]),
    tokenLimit: num(headers["x-ratelimit-limit-tokens"]),
    tokensRemaining: num(headers["x-ratelimit-remaining-tokens"]),
    tokenResetMs: parseResetToMs(headers["x-ratelimit-reset-tokens"]),
    retryAfterMs: parseRetryAfter(headers["retry-after"]),
  };
  return result;
}

const PROVIDER_KIND_PARSERS: Record<
  string,
  (h: Record<string, string | undefined>) => ParsedRateLimitHeaders
> = {
  anthropic: parseAnthropicOpenAI,
  openai: parseAnthropicOpenAI,
  "openai-compatible": parseAnthropicOpenAI,
  gemini: parseGemini,
};

export function parseRateLimitHeaders(
  _providerId: string,
  headers: Record<string, string | undefined>,
  providerKind?: string,
): ParsedRateLimitHeaders {
  const parser = providerKind ? PROVIDER_KIND_PARSERS[providerKind] : undefined;
  return (parser ?? parseGeneric)(headers);
}
