#!/bin/bash
set -e

echo "Building package..."
bun run build

echo "Building docker image..."
docker build -t mailboxed .

echo "Done!"
