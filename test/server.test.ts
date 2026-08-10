import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MockMetrc, SAMPLE_PACKAGES } from "./mock-metrc.js";

/**
 * End-to-end coverage: spawn the compiled server as a real MCP stdio
 * process, pointed at the mock METRC instance via METRC_BASE_URL, and
 * drive it with raw JSON-RPC. This is the same path an MCP client like
 * Claude Desktop exercises.
 *
 * Requires `npm run build` first (the suite runs the compiled entry so
 * it tests what ships, not what tsx transpiles on the fly).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, "..", "dist", "index.js");

class McpStdioHarness {
  private child: ChildProcess;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, (message: unknown) => void>();

  constructor(env: Record<string, string>) {
    this.child = spawn("node", [entry], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.child.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      let newline;
      while ((newline = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line) as { id?: number };
        if (message.id !== undefined && this.pending.has(message.id)) {
          this.pending.get(message.id)!(message);
          this.pending.delete(message.id);
        }
      }
    });
  }

  async request(method: string, params?: unknown): Promise<any> {
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, resolve);
      setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 10_000);
    });
    this.send({ jsonrpc: "2.0", id, method, params });
    return promise;
  }

  notify(method: string): void {
    this.send({ jsonrpc: "2.0", method });
  }

  private send(message: unknown): void {
    this.child.stdin?.write(JSON.stringify(message) + "\n");
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "metrc-mcp-tests", version: "0.0.0" },
    });
    this.notify("notifications/initialized");
  }

  kill(): void {
    this.child.kill();
  }
}

describe("metrc-mcp server over stdio", () => {
  let mock: MockMetrc;
  let harness: McpStdioHarness;

  before(async () => {
    mock = new MockMetrc();
    const base = await mock.start();
    harness = new McpStdioHarness({
      METRC_STATE: "ok",
      METRC_VENDOR_API_KEY: "vendor-key-123",
      METRC_USER_API_KEY: "user-key-456",
      METRC_LICENSE_NUMBER: "PROC-000-TEST",
      METRC_SANDBOX: "true",
      METRC_BASE_URL: base,
      // Deliberately unset: METRC_ALLOW_WRITES — the gate is the default.
    });
    await harness.initialize();
  });

  after(async () => {
    harness.kill();
    await mock.stop();
  });

  test("registers the expected tool set", async () => {
    const response = await harness.request("tools/list");
    const names = response.result.tools.map((t: { name: string }) => t.name).sort();
    assert.deepEqual(names, [
      "finish_package",
      "get_lab_test_results",
      "get_package",
      "list_active_packages",
      "list_facilities",
      "list_incoming_transfers",
      "list_items",
      "list_outgoing_transfers",
    ]);
  });

  test("list_active_packages summarizes METRC's payload for the model", async () => {
    mock.enqueueJson(SAMPLE_PACKAGES);
    const response = await harness.request("tools/call", {
      name: "list_active_packages",
      arguments: {},
    });

    const text = response.result.content[0].text as string;
    const parsed = JSON.parse(text);
    assert.equal(parsed.count, 2);
    assert.equal(parsed.packages[0].item, "Bulk THC Distillate");
    assert.equal(parsed.packages[1].onHold, true);
    // The mock also proves the default license flowed through:
    assert.equal(
      mock.requests.at(-1)?.query.get("licenseNumber"),
      "PROC-000-TEST"
    );
  });

  test("write tools are refused in read-only mode without hitting METRC", async () => {
    const requestsBefore = mock.requests.length;
    const response = await harness.request("tools/call", {
      name: "finish_package",
      arguments: { label: "1A4FF0100000022000000102", actualDate: "2026-08-09" },
    });

    assert.equal(response.result.isError, true);
    const text = response.result.content[0].text as string;
    assert.match(text, /read-only/);
    assert.match(text, /METRC_ALLOW_WRITES/);
    // The refusal must happen before any network call is attempted.
    assert.equal(mock.requests.length, requestsBefore);
  });

  test("METRC errors surface as readable tool errors, not protocol failures", async () => {
    mock.enqueue({
      status: 403,
      body: '{"Message":"User does not have access to this facility."}',
    });
    const response = await harness.request("tools/call", {
      name: "list_items",
      arguments: { licenseNumber: "PROC-OTHER" },
    });

    assert.equal(response.result.isError, true);
    assert.match(
      response.result.content[0].text as string,
      /does not have access/
    );
  });
});
