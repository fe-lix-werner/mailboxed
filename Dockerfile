FROM oven/bun:1.1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy production artifacts
COPY dist ./dist
# Copy migrations
COPY drizzle ./drizzle

# We need to make sure the server can find static files in dist/static
ENV CLIENT_DIR=/app/dist/static

# Create data dir for sqlite and downloads
RUN mkdir -p /data
VOLUME ["/data"]

# Expose port and start server
EXPOSE 3000
CMD ["bun", "dist/index.js"]
