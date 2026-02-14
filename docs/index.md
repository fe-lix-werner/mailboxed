# Documentation Overview

Welcome to the Mailboxed documentation.

Mailboxed connects to one or more IMAP mailboxes, downloads email attachments (optionally filtered by type), saves them to a designated folder structure on disk, and keeps a complete record of what was downloaded and when.

## Table of Contents

- [Installation](installation.md)
- [Configuration](configuration.md)
- [Usage Guide](usage.md)
- [Architecture](architecture.md)

## Key Features

- **Multi-mailbox Sync**: Connect multiple IMAP accounts and manage them in one place.
- **Selective Downloads**: Filter by file extension, MIME type, or size to get exactly what you need.
- **Deduplication**: SHA-256 based file deduplication ensures you don't save the same file twice.
- **Checkpointing**: Resumes from the last processed message (Everything or From Now On).
- **Responsive UI**: Built with React 19 and Tailwind CSS for a modern experience.
- **Secure**: IMAP credentials encrypted at rest with AES-256-GCM.
- **Docker Ready**: Easy deployment with Docker Compose and pre-built images.
