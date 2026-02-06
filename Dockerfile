# --- Build stage ---
FROM oven/bun:1.1 AS builder
WORKDIR /app

# Copy root package files
COPY package.json bun.lock ./

# Copy frontend package files and its lockfile if it exists (though root lockfile should cover it in workspaces)
COPY frontend/package.json ./frontend/

# Install dependencies for both root and frontend
# Bun workspaces will install everything and link them correctly
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# --- Runtime stage ---
FROM oven/bun:1.1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy production artifacts from builder stage
COPY --from=builder /app/dist ./dist
# Copy migrations
COPY --from=builder /app/drizzle ./drizzle
# We need to make sure the server can find static files in dist/static
ENV CLIENT_DIR=/app/dist/static

# Create data dir for sqlite and downloads
RUN mkdir -p /data
VOLUME ["/data"]

# Expose port and start server
EXPOSE 3000
CMD ["bun", "dist/index.js"]
