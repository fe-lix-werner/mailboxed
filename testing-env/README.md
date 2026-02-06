# Mailbox Testing Environment

This environment allows you to spin up a local mail server for testing and send emails via a CLI.

## Setup

1.  **Dependencies**: Ensure you have Docker and Bun installed.
2.  **Start Server**:
    ```bash
    bun testing-env/mail-cli.ts --up
    ```
3.  **Initialize User**:
    (Wait about 10-20 seconds for the server to fully start)
    ```bash
    bun testing-env/mail-cli.ts --init
    ```
    This creates a user `test@example.com` with password `password`.

## Usage

### Sending a simple email
```bash
bun testing-env/mail-cli.ts --to test@example.com --subject "Hello" --body "World"
```

### Sending an email with attachments
```bash
bun testing-env/mail-cli.ts -t test@example.com -s "With attachment" -b "See attached file" -a path/to/file.txt
```

### Stop the server
```bash
bun testing-env/mail-cli.ts --down
```

## Mail Server Details
- **IMAP**: `localhost:10143` (No TLS)
- **SMTP**: `localhost:10587` (No TLS/STARTTLS)
- **Username**: `test@example.com`
- **Password**: `password`
