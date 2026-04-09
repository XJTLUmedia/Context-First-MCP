import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createContextFirstServer } from "@xjtlumedia/context-first-mcp-server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID"
    );
    res.status(204).end();
    return;
  }

  try {
    // Stateless mode: create fresh server + transport per request.
    // Vercel serverless functions are short-lived, so session state
    // lives only within a single warm invocation window.
    const { server } = createContextFirstServer({
      name: "context-first-mcp-remote",
      version: "1.0.0",
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
    await server.close();
  } catch (err) {
    console.error("MCP handler error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
