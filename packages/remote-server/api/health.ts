import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    status: "ok",
    service: "context-first-mcp",
    version: "1.0.0",
    transport: "streamable-http",
    timestamp: new Date().toISOString(),
  });
}
