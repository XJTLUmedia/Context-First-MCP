#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createContextFirstServer } from "@xjtlumedia/context-first-mcp-server";

async function main() {
  const { server, store } = createContextFirstServer({
    name: "context-first-mcp",
    version: "1.0.0",
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  const shutdown = () => {
    store.destroy();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error starting Context-First MCP server:", err);
  process.exit(1);
});
