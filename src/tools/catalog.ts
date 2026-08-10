import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MetrcClient } from "../metrc/client.js";
import type { Item, LabTestResult, Transfer } from "../metrc/types.js";
import { asJsonResult, asTruncatedListResult, withErrors } from "./shared.js";

const licenseArg = z
  .string()
  .optional()
  .describe("Facility license number. Omit to use METRC_LICENSE_NUMBER.");

export function registerCatalogTools(server: McpServer, client: MetrcClient): void {
  server.registerTool(
    "list_items",
    {
      title: "List items",
      description:
        "List the facility's item catalog (the product definitions packages are " +
        "created against): name, category, and unit of measure.",
      inputSchema: { licenseNumber: licenseArg },
    },
    withErrors(async ({ licenseNumber }) => {
      const items = await client.get<Item[]>("/items/v2/active", {
        licenseNumber: client.resolveLicense(licenseNumber),
      });
      const rows = items.map((i) => ({
        id: i.Id,
        name: i.Name,
        category: i.ProductCategoryName,
        unit: i.UnitOfMeasureName,
      }));
      return asTruncatedListResult(rows, "items");
    })
  );

  server.registerTool(
    "list_incoming_transfers",
    {
      title: "List incoming transfers",
      description:
        "List incoming transfers for a facility: manifest number, shipper, and " +
        "package count. Useful for reconciling deliveries against manifests.",
      inputSchema: { licenseNumber: licenseArg },
    },
    withErrors(async ({ licenseNumber }) => {
      const transfers = await client.get<Transfer[]>("/transfers/v2/incoming", {
        licenseNumber: client.resolveLicense(licenseNumber),
      });
      const rows = transfers.map(summarizeTransfer);
      return asTruncatedListResult(rows, "transfers");
    })
  );

  server.registerTool(
    "list_outgoing_transfers",
    {
      title: "List outgoing transfers",
      description:
        "List outgoing transfers for a facility: manifest number, recipient, and " +
        "package count.",
      inputSchema: { licenseNumber: licenseArg },
    },
    withErrors(async ({ licenseNumber }) => {
      const transfers = await client.get<Transfer[]>("/transfers/v2/outgoing", {
        licenseNumber: client.resolveLicense(licenseNumber),
      });
      const rows = transfers.map(summarizeTransfer);
      return asTruncatedListResult(rows, "transfers");
    })
  );

  server.registerTool(
    "get_lab_test_results",
    {
      title: "Get lab test results",
      description:
        "Fetch lab test results for a package by its numeric package ID (not the " +
        "tag label — use get_package first to resolve the ID). Returns test type, " +
        "pass/fail, measured level, and testing lab.",
      inputSchema: {
        packageId: z.number().int().describe("Numeric METRC package ID."),
        licenseNumber: licenseArg,
      },
    },
    withErrors(async ({ packageId, licenseNumber }) => {
      const results = await client.get<LabTestResult[]>("/labtests/v2/results", {
        packageId: String(packageId),
        licenseNumber: client.resolveLicense(licenseNumber),
      });
      const rows = results.map((r) => ({
        test: r.TestTypeName,
        passed: r.TestPassed,
        level: r.TestResultLevel,
        lab: r.LabFacilityName,
        performedDate: r.TestPerformedDate,
      }));
      return asJsonResult({ packageId, count: rows.length, results: rows });
    })
  );
}

function summarizeTransfer(t: Transfer) {
  return {
    manifestNumber: t.ManifestNumber,
    shipper: t.ShipperFacilityName,
    shipperLicense: t.ShipperFacilityLicenseNumber,
    recipient: t.RecipientFacilityName,
    recipientLicense: t.RecipientFacilityLicenseNumber,
    created: t.CreatedDateTime,
    packageCount: t.PackageCount,
  };
}
