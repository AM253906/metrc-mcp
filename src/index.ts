#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, baseUrl } from "./config.js";
import { MetrcClient } from "./metrc/client.js";
import { registerFacilityTools } from "./tools/facilities.js";
import { registerPackageTools } from "./tools/packages.js";
import { registerCatalogTools } from "./tools/catalog.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new MetrcClient(config);

  const server = new McpServer({
    name: "metrc-mcp",
    version: "0.2.0",
  });

  registerFacilityTools(server, client);
  registerPackageTools(server, client, config);
  registerCatalogTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout carries the MCP protocol; diagnostics go to stderr.
  console.error(
    `metrc-mcp connected: ${baseUrl(config)} ` +
      `(writes ${config.allowWrites ? "ENABLED" : "disabled"})`
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
