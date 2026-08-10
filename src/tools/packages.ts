import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MetrcClient } from "../metrc/client.js";
import type { MetrcConfig } from "../config.js";
import type { MetrcPackage } from "../metrc/types.js";
import { WritesDisabledError } from "../metrc/errors.js";
import { asJsonResult, asTruncatedListResult, withErrors } from "./shared.js";

const licenseArg = z
  .string()
  .optional()
  .describe("Facility license number. Omit to use METRC_LICENSE_NUMBER.");

export function registerPackageTools(
  server: McpServer,
  client: MetrcClient,
  config: MetrcConfig
): void {
  server.registerTool(
    "list_active_packages",
    {
      title: "List active packages",
      description:
        "List active (unfinished) packages at a facility: label, item, quantity, " +
        "lab testing state, and hold status. This is the day-to-day inventory view " +
        "for a processor.",
      inputSchema: {
        licenseNumber: licenseArg,
        lastModifiedStart: z
          .string()
          .optional()
          .describe("ISO 8601 date. Only packages modified on/after this date."),
        lastModifiedEnd: z
          .string()
          .optional()
          .describe("ISO 8601 date. Only packages modified on/before this date."),
      },
    },
    withErrors(async ({ licenseNumber, lastModifiedStart, lastModifiedEnd }) => {
      const packages = await client.get<MetrcPackage[]>("/packages/v2/active", {
        licenseNumber: client.resolveLicense(licenseNumber),
        lastModifiedStart,
        lastModifiedEnd,
      });
      const rows = packages.map(summarizePackage);
      return asTruncatedListResult(rows, "packages");
    })
  );

  server.registerTool(
    "get_package",
    {
      title: "Get package by label",
      description:
        "Look up a single package by its METRC tag label (e.g. 1A4FF0100000022000000123) " +
        "and return its full record, including source and testing details.",
      inputSchema: {
        label: z.string().describe("The package tag label."),
        licenseNumber: licenseArg,
      },
    },
    withErrors(async ({ label, licenseNumber }) => {
      const pkg = await client.get<MetrcPackage>(
        `/packages/v2/${encodeURIComponent(label.trim())}`,
        { licenseNumber: client.resolveLicense(licenseNumber) }
      );
      return asJsonResult(pkg);
    })
  );

  server.registerTool(
    "finish_package",
    {
      title: "Finish package (write)",
      description:
        "Mark a zero-quantity package as finished, removing it from active inventory. " +
        "This modifies the state compliance record. Requires METRC_ALLOW_WRITES=true.",
      inputSchema: {
        label: z.string().describe("The package tag label to finish."),
        actualDate: z.string().describe("Finish date, YYYY-MM-DD."),
        licenseNumber: licenseArg,
      },
    },
    withErrors(async ({ label, actualDate, licenseNumber }) => {
      if (!config.allowWrites) throw new WritesDisabledError("finish_package");
      await client.put(
        "/packages/v2/finish",
        { licenseNumber: client.resolveLicense(licenseNumber) },
        [{ Label: label.trim(), ActualDate: actualDate }]
      );
      return asJsonResult({ finished: label.trim(), actualDate });
    })
  );
}

function summarizePackage(p: MetrcPackage) {
  return {
    label: p.Label,
    item: p.Item?.Name,
    category: p.Item?.ProductCategoryName,
    quantity: p.Quantity,
    unit: p.UnitOfMeasureName,
    packagedDate: p.PackagedDate,
    labTestingState: p.LabTestingState,
    onHold: p.IsOnHold,
  };
}
