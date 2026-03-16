import {
  CliError,
  DEFAULT_BACKOFF_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_TIMEOUT_MS,
  ExitCode,
  toErrorMessage,
} from "./config.ts";

export interface HttpGetRequest {
  url: string;
  params: Record<string, string | undefined>;
  timeoutMs?: number;
  retries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrlWithParams(url: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  if (queryString.length === 0) {
    return url;
  }

  return `${url}?${queryString}`;
}

export async function getJsonWithRetry(request: HttpGetRequest): Promise<unknown> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = request.retries ?? DEFAULT_RETRY_COUNT;
  const urlWithParams = buildUrlWithParams(request.url, request.params);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const isLastAttempt = attempt === retries;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(urlWithParams, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      clearTimeout(timer);

      if (!response.ok) {
        if (!isLastAttempt && (response.status >= 500 || response.status === 429)) {
          await sleep(DEFAULT_BACKOFF_MS * 2 ** attempt);
          continue;
        }

        throw new CliError(
          `HTTP request failed with status ${response.status} for ${urlWithParams}`,
          ExitCode.NETWORK,
        );
      }

      try {
        return await response.json();
      } catch (jsonError) {
        throw new CliError(
          `Failed to parse JSON response from ${urlWithParams}: ${toErrorMessage(jsonError)}`,
          ExitCode.NETWORK,
          { cause: jsonError },
        );
      }
    } catch (error) {
      lastError = error;

      if (error instanceof CliError && error.exitCode !== ExitCode.NETWORK) {
        throw error;
      }

      if (!isLastAttempt) {
        await sleep(DEFAULT_BACKOFF_MS * 2 ** attempt);
        continue;
      }
    }
  }

  if (lastError instanceof CliError) {
    throw lastError;
  }

  throw new CliError(
    `Network request failed after retries: ${toErrorMessage(lastError)}`,
    ExitCode.NETWORK,
    { cause: lastError },
  );
}
