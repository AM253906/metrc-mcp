import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MetrcClient } from "../src/metrc/client.js";
import { MetrcApiError } from "../src/metrc/errors.js";
import { MockMetrc, SAMPLE_PACKAGES, testConfig } from "./mock-metrc.js";

describe("MetrcClient", () => {
  let mock: MockMetrc;
  let client: MetrcClient;

  beforeEach(async () => {
    mock = new MockMetrc();
    const base = await mock.start();
    client = new MetrcClient(testConfig(), base);
  });

  afterEach(async () => {
    await mock.stop();
  });

  test("sends HTTP Basic auth with vendor key as username, user key as password", async () => {
    mock.enqueueJson(SAMPLE_PACKAGES);
    await client.get("/packages/v2/active", { licenseNumber: "PROC-000-TEST" });

    const expected =
      "Basic " + Buffer.from("vendor-key-123:user-key-456").toString("base64");
    assert.equal(mock.requests[0]?.authorization, expected);
  });

  test("passes query parameters and omits undefined ones", async () => {
    mock.enqueueJson([]);
    await client.get("/packages/v2/active", {
      licenseNumber: "PROC-000-TEST",
      lastModifiedStart: "2026-08-01",
      lastModifiedEnd: undefined,
    });

    const query = mock.requests[0]?.query;
    assert.equal(query?.get("licenseNumber"), "PROC-000-TEST");
    assert.equal(query?.get("lastModifiedStart"), "2026-08-01");
    assert.equal(query?.has("lastModifiedEnd"), false);
  });

  test("retries on 429 and succeeds on a later attempt", async () => {
    mock.enqueue({
      status: 429,
      headers: { "retry-after": "0.01" },
      body: '{"Message":"Rate limited"}',
    });
    mock.enqueueJson(SAMPLE_PACKAGES);

    const result = await client.get<unknown[]>("/packages/v2/active", {
      licenseNumber: "PROC-000-TEST",
    });

    assert.equal(mock.requests.length, 2);
    assert.equal(result.length, 2);
  });

  test("surfaces a MetrcApiError after retries are exhausted", async () => {
    const limited = {
      status: 429,
      headers: { "retry-after": "0.01" },
      body: '{"Message":"Rate limited"}',
    };
    mock.enqueue(limited, limited, limited);

    await assert.rejects(
      client.get("/packages/v2/active", { licenseNumber: "PROC-000-TEST" }),
      (error: unknown) =>
        error instanceof MetrcApiError && error.status === 429
    );
    assert.equal(mock.requests.length, 3);
  });

  test("normalizes METRC's { Message } error shape into a readable message", async () => {
    mock.enqueue({
      status: 400,
      body: '{"Message":"License number is not valid for this user."}',
    });

    await assert.rejects(
      client.get("/packages/v2/active", { licenseNumber: "WRONG" }),
      (error: unknown) =>
        error instanceof MetrcApiError &&
        error.message.includes("License number is not valid")
    );
  });

  test("maps 401 to a hint about which keys to check", async () => {
    mock.enqueue({ status: 401, body: "" });

    await assert.rejects(
      client.get("/facilities/v2/", {}),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("METRC_VENDOR_API_KEY")
    );
  });

  test("resolveLicense prefers the explicit argument over the default", () => {
    assert.equal(client.resolveLicense("PROC-999"), "PROC-999");
    assert.equal(client.resolveLicense(undefined), "PROC-000-TEST");
    assert.equal(client.resolveLicense("  "), "PROC-000-TEST");
  });

  test("resolveLicense throws a clear error when no license is available", () => {
    const noDefault = new MetrcClient(
      { ...testConfig(), defaultLicense: undefined },
      "http://127.0.0.1:1"
    );
    assert.throws(
      () => noDefault.resolveLicense(undefined),
      /METRC_LICENSE_NUMBER/
    );
  });

  test("serializes write bodies as JSON arrays the way METRC write endpoints expect", async () => {
    mock.enqueueJson(undefined);
    await client.put(
      "/packages/v2/finish",
      { licenseNumber: "PROC-000-TEST" },
      [{ Label: "1A4FF0100000022000000102", ActualDate: "2026-08-09" }]
    );

    const request = mock.requests[0];
    assert.equal(request?.method, "PUT");
    const body = JSON.parse(request?.body ?? "[]") as Array<{ Label: string }>;
    assert.equal(body[0]?.Label, "1A4FF0100000022000000102");
  });
});
