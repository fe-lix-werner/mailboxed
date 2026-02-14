# Architecture

Mailboxed is built with a modern TypeScript stack, focusing on performance and simplicity.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Database**: [SQLite](https://www.sqlite.org/) with [Drizzle ORM](https://orm.drizzle.team/)
- **IMAP Client**: [ImapFlow](https://imapflow.com/)
- **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **State Management**: [TanStack Query](https://tanstack.com/query/latest)
- **Icons**: [Lucide](https://lucide.dev/)

## Project Structure

- `src/`: Backend source code (Bun).
    - `index.ts`: Entry point.
    - `db/`: Database schema and client.
    - `services/`: Business logic (IMAP sync, file management, encryption).
    - `api/`: REST API routes.
- `frontend/`: Frontend source code (React).
    - `src/pages/`: Main application views.
    - `src/components/`: Reusable UI components.
    - `src/hooks/`: Custom React hooks.
- `drizzle/`: Database migrations.
- `docs/`: Project documentation.

## How it Works

1. **Backend** starts a web server and a background scheduler.
2. **Users** add mailboxes via the web UI. Credentials are encrypted and stored in SQLite.
3. **Sync Service** periodically (or on demand) connects to IMAP servers using ImapFlow.
4. **Attachments** are streamed directly to disk to minimize memory usage.
5. **Deduplication** ensures that if multiple emails contain the same file, only one copy is kept on disk.
6. **Frontend** communicates with the Backend via a JSON API to display status and manage settings.
