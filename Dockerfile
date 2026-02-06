FROM oven/bun:1.1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build frontend (to be added later)
# RUN bun run build:fe

EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
