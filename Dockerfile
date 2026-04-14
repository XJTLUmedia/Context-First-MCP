# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:25-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace manifests first (layer-cache friendly)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/stdio-server/package.json packages/stdio-server/

# Install all dependencies (dev included — needed for tsc)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/mcp-server/src      packages/mcp-server/src
COPY packages/mcp-server/tsconfig.json packages/mcp-server/
COPY packages/stdio-server/src     packages/stdio-server/src
COPY packages/stdio-server/tsconfig.json packages/stdio-server/

# Build core library then stdio entry point
RUN pnpm --filter @xjtlumedia/context-first-mcp-server build
RUN pnpm --filter context-first-mcp build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:25-slim

WORKDIR /app

# Install pnpm (needed for production install)
RUN npm install -g pnpm

# Copy workspace manifests
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/stdio-server/package.json packages/stdio-server/

# Production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/packages/mcp-server/dist  packages/mcp-server/dist
COPY --from=builder /app/packages/stdio-server/dist packages/stdio-server/dist

# ── Environment variables ──────────────────────────────────────────────────────
# LLM provider for enhanced analysis (optional)
ENV LLM_PROVIDER=""
# API key for the chosen LLM provider (optional)
ENV LLM_API_KEY=""

# ── Entrypoint ────────────────────────────────────────────────────────────────
CMD ["node", "packages/stdio-server/dist/index.js"]
