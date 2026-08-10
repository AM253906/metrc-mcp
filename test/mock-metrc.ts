import { createServer, type Server, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

export interface CapturedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  authorization: string | undefined;
  body: string;
}

export interface ScriptedResponse {
  status: number;
  headers?: Record<string, string>;
  body: string;
}

/**
 * A minimal in-process stand-in for a METRC state instance.
 *
 * Tests enqueue scripted responses (in order) and afterwards inspect the
 * requests the client actually made — method, path, query string, and the
 * Authorization header. Payload shapes mirror METRC's real v2 responses
 * closely enough to exercise the client's parsing and summarization.
 */
export class MockMetrc {
  private server: Server | undefined;
  readonly requests: CapturedRequest[] = [];
  private queue: ScriptedResponse[] = [];

  enqueue(...responses: ScriptedResponse[]): void {
    this.queue.push(...responses);
  }

  enqueueJson(value: unknown, status = 200): void {
    this.enqueue({ status, body: JSON.stringify(value) });
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      void this.readBody(req).then((body) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        this.requests.push({
          method: req.method ?? "GET",
          path: url.pathname,
          query: url.searchParams,
          authorization: req.headers.authorization,
          body,
        });
        const scripted = this.queue.shift() ?? {
          status: 500,
          body: '{"Message":"MockMetrc: no scripted response left in queue"}',
        };
        res.writeHead(scripted.status, {
          "content-type": "application/json",
          ...scripted.headers,
        });
        res.end(scripted.body);
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, resolve));
    const { port } = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((err) => (err ? reject(err) : resolve()))
    );
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk: Buffer) => (data += chunk.toString()));
      req.on("end", () => resolve(data));
    });
  }
}

/** A realistic active-packages payload, shaped like METRC v2 responses. */
export const SAMPLE_PACKAGES = [
  {
    Id: 4001,
    Label: "1A4FF0100000022000000101",
    Quantity: 1250.5,
    UnitOfMeasureName: "Grams",
    Item: { Name: "Bulk THC Distillate", ProductCategoryName: "Concentrate" },
    PackagedDate: "2026-07-14",
    LabTestingState: "TestPassed",
    IsFinished: false,
    IsOnHold: false,
  },
  {
    Id: 4002,
    Label: "1A4FF0100000022000000102",
    Quantity: 0,
    UnitOfMeasureName: "Grams",
    Item: { Name: "Crude Extract", ProductCategoryName: "Concentrate" },
    PackagedDate: "2026-07-02",
    LabTestingState: "SubmittedForTesting",
    IsFinished: false,
    IsOnHold: true,
  },
];

export function testConfig() {
  return {
    state: "ok",
    vendorApiKey: "vendor-key-123",
    userApiKey: "user-key-456",
    defaultLicense: "PROC-000-TEST",
    sandbox: true,
    allowWrites: false,
    timeoutMs: 5000,
  };
}
