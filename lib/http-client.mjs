export class ExternalServiceError extends Error {
  constructor(message, { status, code, cause } = {}) {
    super(message, { cause });
    this.name = "ExternalServiceError";
    this.status = status;
    this.code = code || "external_service_error";
  }
}

function safeProviderErrorCode(payload) {
  const candidate = payload?.error?.code || payload?.error?.type;
  if (typeof candidate !== "string") return "";
  const value = candidate.trim();
  return /^[a-z][a-z0-9_-]{0,99}$/i.test(value) ? value : "";
}

/** Fetch JSON without ever returning provider response text to the browser. */
export async function fetchJson(url, options = {}) {
  const { timeoutMs = 9_000, service = "External service", ...requestOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...requestOptions, signal: controller.signal });
    const body = await response.text();
    let data = null;

    if (body) {
      try {
        data = JSON.parse(body);
      } catch {
        throw new ExternalServiceError(`${service} returned an invalid response.`, {
          status: response.status,
          code: "invalid_json",
        });
      }
    }

    if (!response.ok) {
      throw new ExternalServiceError(`${service} is unavailable.`, {
        status: response.status,
        // Preserve a stable provider code for server-side control flow, but never
        // pass provider response text through to callers or the browser.
        code: safeProviderErrorCode(data) || "http_error",
      });
    }

    return data;
  } catch (error) {
    if (error instanceof ExternalServiceError) throw error;
    if (error?.name === "AbortError") {
      throw new ExternalServiceError(`${service} timed out.`, { code: "timeout", cause: error });
    }
    throw new ExternalServiceError(`${service} could not be reached.`, { code: "network_error", cause: error });
  } finally {
    clearTimeout(timeout);
  }
}
