FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config and dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build frontend
RUN pnpm build

# Expose port (Railway sets PORT env var)
EXPOSE 3000

# Start server
CMD ["pnpm", "--filter", "algopad-server", "start"]
