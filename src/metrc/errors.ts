/**
 * METRC error responses are inconsistent across endpoints: some return
 * { "Message": "..." }, some return validation arrays, some return plain
 * text. We normalize them into one error type so tool handlers can format
 * a readable message for the model instead of leaking raw JSON.
 */
export class MetrcApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, url: string) {
    super(MetrcApiError.describe(status, body, url));
    this.name = "MetrcApiError";
    this.status = status;
    this.body = body;
  }

  private static describe(status: number, body: string, url: string): string {
    const detail = MetrcApiError.extractMessage(body);
    switch (status) {
      case 400:
        return `METRC rejected the request (400): ${detail}`;
      case 401:
        return "METRC authentication failed (401). Check METRC_VENDOR_API_KEY and METRC_USER_API_KEY.";
      case 403:
        return `METRC denied access (403): ${detail}. The user key may not have access to this facility, or the license number may be wrong.`;
      case 404:
        return `METRC returned 404 for ${url}. The resource may not exist in this state's instance, or the endpoint may differ for this state.`;
      case 429:
        return "METRC rate limit hit (429) and retries were exhausted. Back off before retrying.";
      default:
        return `METRC request failed (${status}): ${detail}`;
    }
  }

  private static extractMessage(body: string): string {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        if (typeof record["Message"] === "string") return record["Message"];
        // Validation errors arrive as arrays of { message } or strings.
        if (Array.isArray(parsed)) {
          return parsed
            .map((entry) =>
              typeof entry === "string"
                ? entry
                : JSON.stringify(entry)
            )
            .join("; ");
        }
      }
    } catch {
      // fall through to raw body
    }
    return body.slice(0, 500) || "(no response body)";
  }
}

export class WritesDisabledError extends Error {
  constructor(toolName: string) {
    super(
      `The "${toolName}" tool modifies METRC records, and this server is running in read-only mode. ` +
        "Set METRC_ALLOW_WRITES=true to enable write operations. " +
        "Do not enable writes against a production license until you have tested against the sandbox."
    );
    this.name = "WritesDisabledError";
  }
}
