import { ImapFlow, type ImapFlowOptions } from "imapflow";
import { logger } from "./logger";
import { decrypt } from "./security";
import { db } from "../db";
import { mailboxes, jobs, checkpoints } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AttachmentProcessor } from "./attachment-processor";
import type { SyncStats, MailboxFilter } from "../types";

type AttachmentPart = {
  part: string;
  filename: string;
  mime: string;
  size: number;
};

type FetchedItem = {
  uid: number;
  envelope: any;
  parts: AttachmentPart[];
};

export class MailboxEngine {
  constructor(private clientFactory?: (options: ImapFlowOptions) => ImapFlow) {}

  async testConnection(config: any) {
    const clientOptions: ImapFlowOptions = {
      host: config.host,
      port: config.port,
      secure: config.tlsMode === "tls",
      auth: {
        user: config.username,
        pass: config.password,
      },
      logger: false,
      connectionTimeout: 10000,
    };

    const client = this.clientFactory ? this.clientFactory(clientOptions) : new ImapFlow(clientOptions);
    try {
      await client.connect();
      await client.logout();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async sync(mailboxId: number, trigger: "poll" | "manual" = "poll", force: boolean = false) {
    if (process.env.NODE_ENV === "test" && !force) {
      logger.info({ mailboxId, trigger }, "Sync skipped in test environment");
      return;
    }

    const mailbox = await db.query.mailboxes.findFirst({
      where: eq(mailboxes.id, mailboxId),
    });

    if (!mailbox || !mailbox.enabled) return;

    const [job] = await db
      .insert(jobs)
      .values({
        mailboxId,
        trigger,
        status: "running",
        startedAt: new Date().toISOString(),
      })
      .returning();

    const stats: SyncStats = {
      scannedMessages: 0,
      savedAttachments: 0,
      skipped: 0,
      errors: 0,
    };

    const maxRetries = 3;
    let attempt = 0;
    let connected = false;

    const clientOptions: ImapFlowOptions = {
      host: mailbox.host,
      port: mailbox.port,
      secure: mailbox.tlsMode === "tls",
      auth: {
        user: mailbox.username,
        pass: decrypt(mailbox.passwordEnc),
      },
      logger: false,
      // strongly reduces IMAP state issues while doing fetch/download sequences
      disableAutoIdle: true,
    };

    const client = this.clientFactory ? this.clientFactory(clientOptions) : new ImapFlow(clientOptions);

    try {
      while (attempt < maxRetries && !connected) {
        try {
          await client.connect();
          connected = true;
        } catch (connErr: any) {
          attempt++;
          if (attempt >= maxRetries) throw connErr;
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn({ mailboxId, attempt, delay }, "Connection failed, retrying...");
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      const folders = JSON.parse(mailbox.folderListJson) as string[];
      const filters = JSON.parse(mailbox.filtersJson) as MailboxFilter;

      const processor = new AttachmentProcessor(
        mailbox.id,
        mailbox.name,
        mailbox.basePath,
        filters,
        job?.id
      );

      for (const folder of folders) {
        const lock = await client.getMailboxLock(folder);
        try {
          const checkpoint = await db.query.checkpoints.findFirst({
            where: and(eq(checkpoints.mailboxId, mailboxId), eq(checkpoints.folder, folder)),
          });

          const searchCriteria: any = checkpoint?.lastUid
            ? { uid: `${checkpoint.lastUid + 1}:*` }
            : mailbox.syncMode === "everything"
              ? { all: true }
              : { since: checkpoint?.fromNowTimestamp ? new Date(checkpoint.fromNowTimestamp) : new Date() };

          if (!checkpoint && mailbox.syncMode === "from-now-on") {
            const now = new Date();
            await db.insert(checkpoints).values({
              mailboxId,
              folder,
              fromNowTimestamp: now.toISOString(),
            });
            searchCriteria.since = now;
          }

          logger.info({ mailboxId, folder, searchCriteria }, "Fetching messages");

          // PHASE 1: fetch only metadata + structure, do NOT download inside this iterator
          const items: FetchedItem[] = [];
          const fetcher = client.fetch(searchCriteria, { uid: true, envelope: true, bodyStructure: true });

          for await (const msg of fetcher) {
            stats.scannedMessages++;

            const parts = this.findAttachmentParts(msg.bodyStructure);

            logger.info(
              {
                uid: msg.uid,
                subject: msg.envelope?.subject,
                attachmentCount: parts.length,
              },
              "Queued message for attachment download"
            );

            items.push({
              uid: msg.uid,
              envelope: msg.envelope,
              parts,
            });

            // Update checkpoint per message to be resilient (as your original)
            const currentCheckpoint = await db.query.checkpoints.findFirst({
              where: and(eq(checkpoints.mailboxId, mailboxId), eq(checkpoints.folder, folder)),
            });

            if (currentCheckpoint) {
              await db.update(checkpoints).set({ lastUid: msg.uid }).where(eq(checkpoints.id, currentCheckpoint.id));
            } else {
              await db.insert(checkpoints).values({
                mailboxId,
                folder,
                lastUid: msg.uid,
              });
            }
          }

          // If it was an "everything" or "from-now-on" sync but no messages were found, 
          // we should still create a checkpoint so next time we use UID
          const finalCheckpoint = await db.query.checkpoints.findFirst({
            where: and(eq(checkpoints.mailboxId, mailboxId), eq(checkpoints.folder, folder)),
          });

          if (!finalCheckpoint?.lastUid && items.length === 0) {
            const mailboxState = await client.status(folder, { uidNext: true });
            if (mailboxState.uidNext) {
              if (finalCheckpoint) {
                await db.update(checkpoints).set({ lastUid: mailboxState.uidNext - 1 }).where(eq(checkpoints.id, finalCheckpoint.id));
              } else {
                await db.insert(checkpoints).values({
                  mailboxId,
                  folder,
                  lastUid: mailboxState.uidNext - 1,
                });
              }
            }
          }

          // PHASE 2: now download parts sequentially (no active fetch iterator)
          for (const item of items) {
            for (const part of item.parts) {
              let partAttempt = 0;
              let partSuccess = false;

              while (partAttempt < maxRetries && !partSuccess) {
                try {
                  const { content: stream } = await client.download(item.uid, part.part, {
                    uid: true,
                    chunkSize: 1024,
                  });

                  const chunks: Buffer[] = [];
                  for await (const chunk of stream as any) {
                    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
                    else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
                    else chunks.push(Buffer.from(String(chunk)));
                  }
                  const content = Buffer.concat(chunks);

                  const result = await processor.process({
                    mailboxId,
                    folder,
                    messageUid: item.uid,
                    messageDate: item.envelope?.date,
                    from: item.envelope?.from?.[0]?.address,
                    subject: item.envelope?.subject,
                    attachmentPartId: part.part,
                    filename: part.filename,
                    mime: part.mime,
                    size: part.size,
                    content,
                  });

                  if (result.saved) {
                    stats.savedAttachments++;
                    logger.info({ mailboxId, uid: item.uid, part: part.part, filename: part.filename }, "Attachment saved");
                  } else if (result.skipped) {
                    stats.skipped++;
                    logger.info({ mailboxId, uid: item.uid, part: part.part, filename: part.filename }, "Attachment skipped by filters");
                  }
                  if (result.error) {
                    stats.errors++;
                    logger.error(
                      { mailboxId, uid: item.uid, part: part.part, filename: part.filename, error: result.error },
                      "Attachment processing error"
                    );
                  }

                  partSuccess = true;
                } catch (err: any) {
                  partAttempt++;
                  if (partAttempt >= maxRetries) {
                    logger.error({ err, mailboxId, uid: item.uid, part: part.part }, "Error downloading attachment after retries");
                    stats.errors++;
                  } else {
                    const delay = Math.pow(2, partAttempt) * 500;
                    await new Promise(resolve => setTimeout(resolve, delay));
                  }
                }
              }
            }
          }
        } finally {
          lock.release();
        }
      }

      await db
        .update(jobs)
        .set({
          status: "success",
          finishedAt: new Date().toISOString(),
          statsJson: JSON.stringify(stats),
        })
        .where(eq(jobs.id, job.id));
    } catch (error: any) {
      logger.error(
        {
          err: error,
          mailboxId,
          message: error.message,
          stack: error.stack,
        },
        "Mailbox sync failed"
      );

      await db
        .update(jobs)
        .set({
          status: "failed",
          finishedAt: new Date().toISOString(),
          errorText: error.message,
          statsJson: JSON.stringify(stats),
        })
        .where(eq(jobs.id, job.id));
    } finally {
      await client.logout();
    }
  }

  findAttachmentParts(structure: any, parts: AttachmentPart[] = []): AttachmentPart[] {
    if (!structure) return parts;

    // ImapFlow sometimes gives:
    //  - type: "multipart", subtype: "mixed"
    //  - OR type: "multipart/mixed" (subtype may be missing)
    //  - OR type: "text", subtype: "plain", etc.
    const rawType = String(structure.type || "").toLowerCase();
    const rawSubtype = String(structure.subtype || "").toLowerCase();

    const isMultipart =
      rawType === "multipart" ||
      rawType.startsWith("multipart/") ||
      (rawType === "multipart" && !!rawSubtype);

    if (isMultipart) {
      if (Array.isArray(structure.childNodes)) {
        for (const child of structure.childNodes) {
          this.findAttachmentParts(child, parts);
        }
      }
      return parts;
    }

    const dispType = String(structure.disposition || "").toLowerCase();
    const filename =
      structure.dispositionParameters?.filename ||
      structure.parameters?.filename ||
      structure.parameters?.name ||
      "";

    const isAttachment = dispType === "attachment" || !!filename;

    if (isAttachment) {
      const partId = String(structure.part || "");
      if (partId) {
        // Build MIME robustly:
        // - if rawType already contains '/', use it as-is (e.g. "multipart/mixed", "application/pdf")
        // - else combine type/subtype
        const mime = rawType.includes("/")
          ? rawType
          : `${rawType}/${rawSubtype || "octet-stream"}`;

        parts.push({
          part: partId,
          filename: filename || "unnamed",
          mime,
          size: Number(structure.size) || 0,
        });
      }
    }

    // Defensive recursion for odd structures
    if (Array.isArray(structure.childNodes)) {
      for (const child of structure.childNodes) {
        this.findAttachmentParts(child, parts);
      }
    }

    return parts;
  }
}