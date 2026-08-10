/**
 * Configuration is read from environment variables once at startup.
 *
 * METRC is deployed per-state (api-ok.metrc.com, api-ca.metrc.com, ...),
 * and each state also runs a sandbox instance. Rather than hardcoding a
 * state list that goes stale as METRC signs new contracts, we build the
 * hostname from the two-letter state code and validate its shape only.
 */

export interface MetrcConfig {
  /** Two-letter state code, lowercased (e.g. "ok", "co", "mi"). */
  state: string;
  /** Software vendor API key (identifies the integrator). */
  vendorApiKey: string;
  /** User API key (identifies the METRC user; scopes facility access). */
  userApiKey: string;
  /**
   * Default license number applied when a tool call omits one.
   * Most operators work under a single license, so this saves the
   * model from asking on every call.
   */
  defaultLicense: string | undefined;
  /** Use the state's sandbox instance instead of production. */
  sandbox: boolean;
  /**
   * Write operations (creating packages, adjusting inventory, ...) are
   * disabled unless this is set. A track-and-trace system is a legal
   * record; an LLM should not be able to mutate it by default.
   */
  allowWrites: boolean;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
  /**
   * Test hook: full base URL override (e.g. a mocked METRC instance).
   * When set, state/sandbox URL derivation is bypassed. Not for
   * production use.
   */
  baseUrlOverride: string | undefined;
}

class ConfigError extends Error {}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new ConfigError(
      `Missing required environment variable ${name}. See .env.example.`
    );
  }
  return value.trim();
}

export function loadConfig(): MetrcConfig {
  const state = required("METRC_STATE").toLowerCase();
  if (!/^[a-z]{2}$/.test(state)) {
    throw new ConfigError(
      `METRC_STATE must be a two-letter state code, got "${state}".`
    );
  }

  return {
    state,
    vendorApiKey: required("METRC_VENDOR_API_KEY"),
    userApiKey: required("METRC_USER_API_KEY"),
    defaultLicense: process.env.METRC_LICENSE_NUMBER?.trim() || undefined,
    sandbox: process.env.METRC_SANDBOX === "true",
    allowWrites: process.env.METRC_ALLOW_WRITES === "true",
    timeoutMs: Number(process.env.METRC_TIMEOUT_MS ?? 30_000),
    baseUrlOverride: process.env.METRC_BASE_URL?.trim() || undefined,
  };
}

export function baseUrl(config: MetrcConfig): string {
  if (config.baseUrlOverride) return config.baseUrlOverride;
  const prefix = config.sandbox ? "sandbox-api" : "api";
  return `https://${prefix}-${config.state}.metrc.com`;
}
