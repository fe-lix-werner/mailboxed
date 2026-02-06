#!/bin/bash
set -e

echo "Building package..."
bun run build

echo "Building docker image..."
# Standard build
# docker build -t mailboxed .

# Multi-arch build (uncomment if you have a builder configured)
# docker buildx build --platform linux/amd64,linux/arm64 -t mailboxed --load .
docker build -t mailboxed .

echo "Done!"
