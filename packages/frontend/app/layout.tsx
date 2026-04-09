import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Context-First MCP — Fight LLM Context Degradation",
  description:
    "A Context Custodian MCP server that fights conversation degradation with recap, conflict detection, ambiguity checking, and execution verification.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <nav className="border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <a href="/" className="text-xl font-bold text-brand-600">
              Context-First MCP
            </a>
            <div className="flex gap-6 text-sm">
              <a href="/" className="hover:text-brand-600 transition-colors">
                Home
              </a>
              <a
                href="/demo"
                className="hover:text-brand-600 transition-colors"
              >
                Demo
              </a>
              <a
                href="/docs"
                className="hover:text-brand-600 transition-colors"
              >
                Docs
              </a>
              <a
                href="https://github.com/context-first/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-600 transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="border-t border-gray-200 dark:border-gray-800 px-6 py-8 mt-20">
          <div className="max-w-6xl mx-auto text-center text-sm text-gray-500">
            Context-First MCP — MIT License — Fighting LLM context degradation
          </div>
        </footer>
      </body>
    </html>
  );
}
