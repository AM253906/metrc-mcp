import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * METRC list endpoints can return thousands of rows for a busy facility.
 * Dumping all of them into the model's context is wasteful and often
 * counterproductive, so list tools cap their output and say so, letting
 * the model narrow with filters instead.
 */
export const MAX_ROWS = 100;

export function asJsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function asTruncatedListResult(rows: unknown[], label: string): CallToolResult {
  if (rows.length <= MAX_ROWS) {
    return asJsonResult({ count: rows.length, [label]: rows });
  }
  return asJsonResult({
    count: rows.length,
    returned: MAX_ROWS,
    note: `Showing first ${MAX_ROWS} of ${rows.length} ${label}. Narrow the date range or filters to see the rest.`,
    [label]: rows.slice(0, MAX_ROWS),
  });
}

export function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

/** Wrap a handler so thrown errors become readable tool errors instead of protocol failures. */
export function withErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<CallToolResult>
): (...args: Args) => Promise<CallToolResult> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResult(error);
    }
  };
}
