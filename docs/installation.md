---
layout: default
title: Installation
---
# Installation Guide

You can run Mailboxed either using Docker (recommended for production) or directly using Bun (recommended for development).

## Prerequisites

- [Bun](https://bun.sh) (v1.x) - required for manual installation and development.
- Docker & Docker Compose - required for containerized deployment.

## Docker (Recommended for Production)

The easiest way to run Mailboxed is using the pre-built Docker image.

### Using Docker Run

```bash
docker run -d \
  -p 3000:3000 \
  -v ./data:/data \
  -e APP_SECRET=your-secret \
  ghcr.io/fe-lix-werner/mailboxed:master
```

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  mailboxed:
    image: ghcr.io/fe-lix-werner/mailboxed:master
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - APP_SECRET=your-session-secret
      - IMAP_CRED_MASTER_KEY=64-character-hex-string
```

Run with:

```bash
docker-compose up -d
```

Volumes are mapped to `/data` in the container, which contains both the SQLite database and the downloaded attachments.

## Manual Installation (Development)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/fe-lix-werner/mailboxed.git
   cd mailboxed
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Initialize the database**:
   ```bash
   bun db:push
   ```

4. **Start the development server**:
   ```bash
   bun dev
   ```
   This starts both the Backend (on port 3000) and the Frontend (on port 5173 by default, proxied by the backend).

   Alternatively, you can start them separately:
   - `bun dev:backend`
   - `bun dev:frontend`

## Building for Production

To build the project manually for production:

```bash
bun run build
```

This will create a `dist` directory containing the compiled backend and the static frontend assets.
