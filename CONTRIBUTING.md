# Contributing to Context-First MCP

Thanks for your interest in contributing!

## Development Setup

1. **Clone the repo**:
   ```bash
   git clone https://github.com/context-first/mcp.git
   cd mcp
   ```

2. **Install dependencies** (requires [pnpm](https://pnpm.io)):
   ```bash
   pnpm install
   ```

3. **Build all packages**:
   ```bash
   pnpm build
   ```

4. **Run tests**:
   ```bash
   pnpm test
   ```

## Project Structure

```
packages/
├── mcp-server/      # Core library — tools, state, analysis engine
├── stdio-server/    # npx entry point (stdio transport)
├── remote-server/   # Vercel deployment (Streamable HTTP)
└── frontend/        # Next.js showcase app
```

## Making Changes

1. Create a feature branch from `main`
2. Make your changes in the appropriate package
3. Add tests for new functionality
4. Run `pnpm build && pnpm test` to verify
5. Submit a pull request

## Code Style

- TypeScript strict mode (`"strict": true`)
- No `any` types
- Use `zod` for runtime schema validation
- Prefer named exports
- Keep tool implementations in `packages/mcp-server/src/tools/`

## Adding a New Tool

1. Create `packages/mcp-server/src/tools/your-tool.ts`
2. Define Zod input schema and handler function
3. Register the tool in `packages/mcp-server/src/index.ts`
4. Add tests in `packages/mcp-server/src/tools/__tests__/`
5. Update README.md tool reference table

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
