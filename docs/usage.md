---
layout: default
title: Usage Guide
---
# Usage Guide

Once Mailboxed is running, you can access the web interface at `http://localhost:3000`.

## Setting up a Mailbox

1. Navigate to the **Mailboxes** section.
2. Click on **Add Mailbox**.
3. Provide your IMAP details:
    - **Host**: e.g., `imap.gmail.com`
    - **Port**: usually `993`
    - **User**: your email address
    - **Password**: your app-specific password (recommended)
    - **Use TLS**: typically enabled for port 993

## Syncing Attachments

After adding a mailbox, you can configure how it syncs:

- **Filter by Extension**: Specify extensions like `.pdf`, `.jpg`, etc.
- **Filter by MIME Type**: e.g., `application/pdf`, `image/jpeg`.
- **Max File Size**: Prevent large files from being downloaded.
- **Sync Strategy**: 
    - **Everything**: Process all messages in the mailbox.
    - **From Now On**: Only process new messages arriving after the sync starts.

## File Storage

Attachments are saved to the directory specified by `DOWNLOAD_ROOT`. They are organized into folders by mailbox and date to keep things tidy.

### Deduplication

Mailboxed calculates a SHA-256 hash for every file it downloads. If a file with the same hash has already been downloaded (even from a different mailbox), it won't be saved again, saving disk space and preventing duplicates in your record.

## Dashboard

The dashboard provides an overview of:
- Total mailboxes connected.
- Number of attachments downloaded.
- Recent sync activity.
- Storage usage.
