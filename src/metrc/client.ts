import { MetrcConfig, baseUrl } from "../config.js";
import { MetrcApiError } from "./errors.js";

/**
 * Thin, typed wrapper over the METRC REST API.
 *
 * Auth: METRC uses HTTP Basic where the username is the *vendor* API key
 * and the password is the *user* API key. This trips up most first-time
 * integrators, who expect a single bearer token.
 *
 * Rate limits: METRC enforces per-second and per-facility limits and
 * returns 429 when exceeded. We retry with backoff a small, bounded
 * number of times; beyond that the error surfaces to the caller. Batch
 * jobs should paginate politely rather than rely on this retry.
 */
export class MetrcClient {
  private readonly authHeader: string;
  private readonly base: string;

  /**
   * @param baseOverride Test hook: point the client at a mock METRC
   *   instance instead of deriving the URL from the state code.
   */
  constructor(
    private readonly config: MetrcConfig,
    baseOverride?: string
  ) {
    const credentials = Buffer.from(
      `${config.vendorApiKey}:${config.userApiKey}`
    ).toString("base64");
    this.authHeader = `Basic ${credentials}`;
    this.base = baseOverride ?? baseUrl(config);
  }

  /**
   * Resolve the license number for a request: an explicit argument wins,
   * otherwise fall back to METRC_LICENSE_NUMBER from the environment.
   */
  resolveLicense(explicit?: string): string {
    const license = explicit?.trim() || this.config.defaultLicense;
    if (!license) {
      throw new Error(
        "No license number provided. Pass licenseNumber or set METRC_LICENSE_NUMBER."
      );
    }
    return license;
  }

  async get<T>(path: string, query: Record<string, string | undefined> = {}): Promise<T> {
    return this.request<T>("GET", path, query);
  }

  async post<T>(
    path: string,
    query: Record<string, string | undefined>,
    body: unknown
  ): Promise<T> {
    return this.request<T>("POST", path, query, body);
  }

  async put<T>(
    path: string,
    query: Record<string, string | undefined>,
    body: unknown
  ): Promise<T> {
    return this.request<T>("PUT", path, query, body);
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    query: Record<string, string | undefined>,
    body?: unknown
  ): Promise<T> {
    const url = new URL(path, this.base);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      const response = await this.fetchWithTimeout(url, method, body);

      if (response.status === 429 && attempt < maxAttempts) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : attempt * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      const text = await response.text();
      if (!response.ok) {
        throw new MetrcApiError(response.status, text, url.pathname);
      }
      if (text === "") return undefined as T;
      return JSON.parse(text) as T;
    }
  }

  private async fetchWithTimeout(
    url: URL,
    method: string,
    body?: unknown
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `METRC request to ${url.pathname} timed out after ${this.config.timeoutMs}ms.`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
