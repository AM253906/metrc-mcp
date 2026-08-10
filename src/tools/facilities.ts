import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MetrcClient } from "../metrc/client.js";
import type { Facility } from "../metrc/types.js";
import { asJsonResult, withErrors } from "./shared.js";

export function registerFacilityTools(server: McpServer, client: MetrcClient): void {
  server.registerTool(
    "list_facilities",
    {
      title: "List facilities",
      description:
        "List the facilities the configured METRC user key can access, with license " +
        "numbers and license types. Call this first if you don't know which license " +
        "number to use for other tools.",
      inputSchema: {},
    },
    withErrors(async () => {
      const facilities = await client.get<Facility[]>("/facilities/v2/");
      const summary = facilities.map((f) => ({
        name: f.DisplayName || f.Name,
        licenseNumber: f.License.Number,
        licenseType: f.License.LicenseType,
      }));
      return asJsonResult(summary);
    })
  );
}
