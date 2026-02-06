 # Mailboxed — Requirements (v1)

## 1. Purpose
Mailboxed connects to one or more IMAP mailboxes, downloads email attachments (optionally filtered by type), saves them to a designated folder structure on disk, and keeps a complete record of what was downloaded and when. Access is protected by required login. IMAP credentials are encrypted at rest.

---

## 2. Scope
### In scope
- Multi-mailbox IMAP configuration
- Attachment download + filtering + dedupe
- Per-mailbox polling schedule + manual “Sync now”
- Persistent tracking/audit of downloads + job history
- Basic security: login, hashed passwords, encrypted IMAP passwords
- Dockerized deployment with persistent volumes

### Out of scope (v1)
- Serving attachment files through the app (UI will show paths/metadata only)
- OAuth mailbox auth (IMAP user/pass only)
- Complex multi-tenant org roles/permissions beyond basic users

---

## 3. Definitions
- **Mailbox**: IMAP account configuration (host, port, TLS, username, encrypted password, folders).
- **Sync mode**:
  - **Everything**: Scan historical messages and download matching attachments.
  - **From now on**: Start tracking only new messages from the moment enabled (checkpoint).
- **Job**: A sync run execution (triggered by polling or manual action).
- **Download record**: A DB entry for each attachment saved, linking it to message UID/folder/part and file path/hash.

---

## 4. Functional requirements

### 4.1 Authentication & security
1. App requires login for all routes and APIs.
2. User passwords stored as salted hashes (Argon2).
3. IMAP passwords encrypted at rest using AES-256-GCM (or libsodium secretbox) with a master key from env.
4. Sessions:
   - Secure cookie-based session preferred (httpOnly, SameSite, Secure behind TLS).
   - Session expiry enforced; logout supported.
5. Login attempt throttling (rate limit) and CSRF protection when using cookies.
6. Logs must never include credentials; all sensitive fields redacted.

**Acceptance criteria**
- Cannot access UI/API without login.
- User password hashes are not reversible and verify correctly.
- IMAP password can be decrypted only with the correct master key.
- Invalid logins are rate limited.

---

### 4.2 Mailbox management
1. Users can create, view, edit, enable/disable, and delete mailboxes.
2. Mailbox config includes:
   - Display name
   - Host, port, TLS mode
   - Username + encrypted password
   - Folders to scan (default: INBOX)
   - Base download path
   - Filters (extensions, MIME types, optional size bounds)
   - Dedupe policy
   - Sync mode (Everything / From now on)
   - Poll interval
   - Busy policy (skip if running / queue one)
3. “Test connection” validates the IMAP config before save (or as a separate action).

**Acceptance criteria**
- Multiple mailboxes can be configured and independently enabled/disabled.
- Connection test fails with actionable error messages.
- Editing poll interval or filters changes future runs without restart (best effort).

---

### 4.3 Attachment selection, storage, and dedupe
1. Default downloads all attachments.
2. Optional filters:
   - Extension allowlist/denylist
   - MIME allowlist/denylist (and optional wildcard like `image/*`)
   - Optional size bounds (min/max)
3. Storage:
   - Each mailbox has a base folder (user-configured).
   - Support an output path template (at least):
     - `/MailboxName/YYYY/MM/`
   - Filename collisions handled deterministically (append short hash suffix).
4. Dedupe:
   - Calculate SHA-256 per saved attachment.
   - Ensure “already downloaded” detection based on `(mailboxId, folder, messageUid, attachmentPartId)` and/or SHA-256.

**Acceptance criteria**
- Same attachment is not downloaded twice under the configured dedupe policy.
- Stored files match the template and survive restarts.
- Hash recorded equals the file content hash.

---

### 4.4 Sync behavior (poll + manual)
1. Per-mailbox polling:
   - User-configurable poll interval (min 1 minute, max 24 hours; exact limits configurable).
   - Polling triggers a job if mailbox enabled.
2. Manual sync:
   - “Sync now” triggers a job immediately for that mailbox.
3. Busy policy:
   - If a job is already running:
     - `skip`: next poll does nothing and logs “skipped - running”
     - `queue_one`: allow at most one queued job per mailbox
4. Resilience:
   - Retry transient failures with backoff.
   - Persist progress checkpoints to resume without duplicating downloads.
5. Sync mode:
   - Everything: scan historical data using UID checkpoints to avoid repeated work.
   - From now on: store a checkpoint at enable time so only newer UIDs are processed.

**Acceptance criteria**
- Poll jobs start at the configured interval when enabled.
- “Sync now” creates a job even if polling is disabled.
- With `queue_one`, repeated clicks do not create unlimited queued jobs.
- If the app restarts mid-run, it resumes without redownloading already recorded attachments.

---

### 4.5 Tracking, audit, and search
1. Persist download records with:
   - mailboxId, folder, messageUid, messageDate
   - from, subject (for UI)
   - attachment filename, MIME, size, SHA-256
   - saved file path
   - downloadedAt, jobId
2. Persist job history:
   - startedAt, finishedAt, status, counts (scanned messages, saved attachments, skipped, errors)
   - last error details per job
3. Provide search/filter UI and API:
   - mailbox, date range, sender, subject, filename, extension/MIME

**Acceptance criteria**
- Downloads view can filter by mailbox + filename and returns correct rows.
- Each download record links to a job run and has a valid file path.

---

## 5. Non-functional requirements
- Must run via Docker.
- Persistent volumes:
  - SQLite DB
  - Download root (or user-configured base path under a mounted root)
- Atomic file writes: write to temp file then rename; never leave partial files as “done”.
- Reasonable performance for large mailboxes:
  - Use IMAP UID ranges/checkpoints
  - Avoid fetching full message bodies when not needed
  - Stream attachments to disk
- Timezone handling: store timestamps in UTC.

---

## 6. Tech stack

### Required
- Bun (backend runtime) using `Bun.serve`
- React 19.2
- EinUI
- @tanstack/react-query
- Docker
- imapflow
- SQLite

### Recommended additional libraries
Backend:
- Validation: `zod`
- Password hashing: `argon2`
- Encryption: Bun `crypto` (AES-256-GCM) (or `libsodium-wrappers`)
- DB + migrations: `drizzle-orm` + `drizzle-kit`
- Logging: `pino`
- Scheduler: `croner`
- File type sniffing: `file-type` (optional but recommended)

Frontend:
- Routing: `react-router`
- Forms: `react-hook-form` + `@hookform/resolvers`
- Tables: `@tanstack/react-table`
- Dates: `date-fns`

---

## 7. Architecture (high level)
- Single Bun server process:
  - REST-ish JSON API via `Bun.serve({ fetch })`
  - Static frontend hosting (or separate frontend build served by Bun)
  - Background scheduler managing per-mailbox polling timers
  - Sync worker(s) with a mailbox-level lock to enforce busy policy
- SQLite for all state: users, mailboxes, checkpoints, jobs, downloads

---

## 8. Data model (minimum)
- `users`: id, email, passwordHash, createdAt
- `mailboxes`:
  - id, userId, name, host, port, tlsMode, username, passwordEnc
  - basePath, folderListJson
  - filtersJson, dedupeMode
  - syncMode, enabled
  - pollIntervalSec, busyPolicy
  - createdAt, updatedAt
- `checkpoints`: mailboxId, folder, lastUid, fromNowTimestamp
- `jobs`: id, mailboxId, trigger(`poll|manual`), status, startedAt, finishedAt, statsJson, errorText
- `downloads`: id, mailboxId, folder, messageUid, messageDate, from, subject, attachmentPartId,
  filename, mime, size, sha256, path, downloadedAt, jobId

---

## 9. API endpoints (proposal)
Auth
- `POST /api/auth/login` {email, password}
- `POST /api/auth/logout`
- `GET  /api/auth/me`

Mailboxes
- `GET  /api/mailboxes`
- `POST /api/mailboxes`
- `GET  /api/mailboxes/:id`
- `PUT  /api/mailboxes/:id`
- `DELETE /api/mailboxes/:id`
- `POST /api/mailboxes/:id/test-connection`
- `POST /api/mailboxes/:id/sync` (manual trigger)
- `POST /api/mailboxes/:id/pause`
- `POST /api/mailboxes/:id/resume`

Jobs
- `GET /api/jobs?mailboxId=&status=&limit=&offset=`
- `GET /api/jobs/:id`

Downloads
- `GET /api/downloads?mailboxId=&q=&from=&to=&mime=&ext=&limit=&offset=`
- `GET /api/downloads/export.csv?…` (optional)

Health
- `GET /healthz`

---

## 10. UI/UX requirements

### Look & feel
- Clean, minimal, “mail admin” vibe
- EinUI components, consistent spacing/typography
- Status shown as label + subtle icon (avoid noisy colors)

### Views
1. **Login**
   - Email + password form
   - Error feedback; lockout/rate-limit messaging
2. **Dashboard**
   - Mailbox cards: status, last sync, last success, last error (collapsed), poll interval
   - Actions: Sync now, Pause/Resume, Enable/Disable, open details
3. **Mailboxes**
   - List/table: name, enabled, poll interval, last sync, errors
   - Add mailbox
4. **Mailbox editor (create/edit)**
   - Connection settings + Test connection
   - Folders selection
   - Download rules (filters, base path, template preview, dedupe)
   - Sync settings (Everything/From now on, poll interval, busy policy)
5. **Mailbox detail**
   - Tabs:
     - Overview (stats, next poll time, last runs, Sync now)
     - Downloads (filtered to mailbox)
     - Jobs (history, error details)
     - Settings (edit form)
6. **Downloads (global)**
   - Search/filter across mailboxes
   - Row drawer with metadata + file path

---

## 11. Testing requirements

### Unit tests (bun test)
- Filters (ext/MIME/size)
- Path templating + collision handling
- Dedupe rules (UID/part and hash)
- Crypto: encrypt/decrypt IMAP password, Argon2 hash/verify
- Busy policy logic (`skip`, `queue_one`)

### Integration tests
- SQLite migrations + basic CRUD
- Job lifecycle (queued → running → success/failed)
- Checkpoint/resume after simulated crash
- Atomic download write (no partial “completed” state)

### IMAP simulation tests (Docker)
- Run an IMAP test server container seeded with messages/attachments
- Scenarios:
  - Multiple folders
  - Large attachment streaming
  - Connection drop + retry
  - Duplicates across messages
  - From now on checkpoint behavior

### Optional E2E tests
- Playwright: login → add mailbox → test connection → Sync now → downloads appear

**Acceptance criteria**
- CI runs unit + integration tests.
- IMAP simulation tests verify at least one end-to-end attachment download and record creation.

---

## 12. Deployment & configuration
Docker:
- Volumes:
  - `/data/db` for SQLite
  - `/data/downloads` for files
Env:
- `APP_SECRET` (session signing)
- `IMAP_CRED_MASTER_KEY` (encryption key)
- `DB_PATH` (e.g. `/data/db/mailboxed.sqlite`)
- `DOWNLOAD_ROOT` (default base path root)
- `LOG_LEVEL`

Health:
- `/healthz` returns 200 when DB reachable and scheduler running.

---

## 13. Open decisions (defaults if not specified)
- Default busy policy: `skip`
- Default poll interval: 10 minutes
- Default folders: INBOX only
- Default dedupe: message UID + part + hash
- File serving: off (paths only)
