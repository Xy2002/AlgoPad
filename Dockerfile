FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config and dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY scripts/postinstall.js scripts/

# Install dependencies (skip postinstall scripts, we only need the SWC copy)
RUN pnpm install --frozen-lockfile --ignore-scripts && node scripts/postinstall.js

# Copy source code
COPY . .

# Build frontend
RUN pnpm build

# Expose port (Railway sets PORT env var)
EXPOSE 3000

# Push database schema then start server
CMD ["sh", "-c", "pnpm db:push && pnpm --filter algopad-server start"]
