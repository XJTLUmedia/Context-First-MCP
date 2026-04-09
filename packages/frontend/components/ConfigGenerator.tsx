"use client";

import { useState } from "react";

interface ConfigOption {
  label: string;
  id: string;
}

const CLIENTS: ConfigOption[] = [
  { label: "Claude Desktop", id: "claude" },
  { label: "Cursor", id: "cursor" },
  { label: "VS Code", id: "vscode" },
  { label: "Remote (Streamable HTTP)", id: "remote" },
];

const configs: Record<string, string> = {
  claude: JSON.stringify(
    {
      mcpServers: {
        "context-first": {
          command: "npx",
          args: ["-y", "context-first-mcp"],
        },
      },
    },
    null,
    2
  ),
  cursor: JSON.stringify(
    {
      mcpServers: {
        "context-first": {
          command: "npx",
          args: ["-y", "context-first-mcp"],
        },
      },
    },
    null,
    2
  ),
  vscode: JSON.stringify(
    {
      mcp: {
        servers: {
          "context-first": {
            command: "npx",
            args: ["-y", "context-first-mcp"],
          },
        },
      },
    },
    null,
    2
  ),
  remote: JSON.stringify(
    {
      mcpServers: {
        "context-first": {
          url: "https://context-first-mcp.vercel.app/api/mcp",
        },
      },
    },
    null,
    2
  ),
};

export function ConfigGenerator() {
  const [selected, setSelected] = useState("claude");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(configs[selected]).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-bold text-sm">Configuration Generator</h3>
        <p className="text-xs text-gray-500 mt-1">
          Select your MCP client to generate the config
        </p>
      </div>
      <div className="p-4">
        <div className="flex gap-2 mb-4 flex-wrap">
          {CLIENTS.map((client) => (
            <button
              key={client.id}
              onClick={() => {
                setSelected(client.id);
                setCopied(false);
              }}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                selected === client.id
                  ? "bg-brand-600 text-white border-brand-600"
                  : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {client.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
            {configs[selected]}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
