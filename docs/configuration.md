---
layout: page
title: Configuration
---
# Configuration

Mailboxed can be configured using environment variables.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_SECRET` | Used for session signing and general app security. | Generated automatically |
| `IMAP_CRED_MASTER_KEY` | 64-character hex string used to encrypt IMAP credentials at rest. | Generated automatically |
| `DB_PATH` | Path to the SQLite database file. | `mailboxed.sqlite` |
| `DOWNLOAD_ROOT` | Directory where attachments will be saved. | `downloads` |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`). | `info` |
| `PORT` | Port the server listens on. | `3000` |

### Secrets Management

If `IMAP_CRED_MASTER_KEY` and `APP_SECRET` are not provided via environment variables, Mailboxed will automatically generate them on the first run and store them in a `.secrets.json` file. 

**Important**: In production, it is highly recommended to provide these via environment variables and back them up securely. If you lose the `IMAP_CRED_MASTER_KEY`, you will not be able to decrypt and use the stored IMAP credentials.

### Example `.env` file

```env
APP_SECRET=your-session-secret
IMAP_CRED_MASTER_KEY=64-character-hex-string
DB_PATH=data/mailboxed.sqlite
DOWNLOAD_ROOT=data/downloads
LOG_LEVEL=info
```

## Security

- **Credential Encryption**: All IMAP passwords and settings are encrypted using AES-256-GCM before being stored in the database.
- **Session Security**: Sessions are managed securely and signed with the `APP_SECRET`.
