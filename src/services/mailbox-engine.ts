import { ImapFlow, type ImapFlowOptions } from "imapflow";
import { logger } from "./logger";
import { decrypt } from "./security";
import { db } from "../db";
import { mailboxes, jobs, checkpoints } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AttachmentProcessor } from "./attachment-processor";
import type { SyncStats, MailboxFilter } from "../types";

export class MailboxEngine {
  constructor(private clientFactory?: (options: ImapFlowOptions) => ImapFlow) {}

  async sync(mailboxId: number, trigger: "poll" | "manual" = "poll") {
    const mailbox = await db.query.mailboxes.findFirst({
      where: eq(mailboxes.id, mailboxId),
    });

    if (!mailbox || !mailbox.enabled) return;

    // 1. Create Job
    const [job] = await db.insert(jobs).values({
      mailboxId,
      trigger,
      status: "running",
      startedAt: new Date().toISOString(),
    }).returning();

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
    };

    const client = this.clientFactory ? this.clientFactory(clientOptions) : new ImapFlow(clientOptions);

    try {
      // Retry connection
      while (attempt < maxRetries && !connected) {
        try {
          await client.connect();
          connected = true;
        } catch (connErr: any) {
          attempt++;
          if (attempt >= maxRetries) throw connErr;
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn({ mailboxId, attempt, delay }, `Connection failed, retrying...`);
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
        job.id
      );

      for (const folder of folders) {
        let lock = await client.getMailboxLock(folder);
        try {
          // Get checkpoint
          const checkpoint = await db.query.checkpoints.findFirst({
            where: and(
              eq(checkpoints.mailboxId, mailboxId),
              eq(checkpoints.folder, folder)
            ),
          });

          const searchCriteria = checkpoint?.lastUid 
            ? { uid: `${checkpoint.lastUid + 1}:*` } 
            : (mailbox.syncMode === "everything" ? { all: true } : { since: new Date() });

          for await (let msg of client.listMessages(folder, searchCriteria, { uid: true, envelope: true, bodyStructure: true })) {
            stats.scannedMessages++;
            
            // Recurse body structure for attachments
            const parts = this.findAttachmentParts(msg.bodyStructure);
            for (const part of parts) {
              let partAttempt = 0;
              let partSuccess = false;

              while (partAttempt < maxRetries && !partSuccess) {
                try {
                  const { content } = await client.download(folder, msg.uid.toString(), { part: part.part });
                  
                  const result = await processor.process({
                    mailboxId,
                    folder,
                    messageUid: msg.uid,
                    messageDate: msg.envelope.date,
                    from: msg.envelope.from?.[0]?.address,
                    subject: msg.envelope.subject,
                    attachmentPartId: part.part,
                    filename: part.filename,
                    mime: part.mime,
                    size: part.size,
                    content,
                  });

                  if (result.saved) stats.savedAttachments++;
                  else if (result.skipped) stats.skipped++;
                  if (result.error) stats.errors++;
                  
                  partSuccess = true;
                } catch (err: any) {
                  partAttempt++;
                  if (partAttempt >= maxRetries) {
                    logger.error({ err, mailboxId, uid: msg.uid, part: part.part }, "Error downloading attachment after retries");
                    stats.errors++;
                  } else {
                    const delay = Math.pow(2, partAttempt) * 500;
                    await new Promise(resolve => setTimeout(resolve, delay));
                  }
                }
              }
            }

            // Update checkpoint per message to be resilient
            if (checkpoint) {
              await db.update(checkpoints)
                .set({ lastUid: msg.uid })
                .where(eq(checkpoints.id, checkpoint.id));
            } else {
              await db.insert(checkpoints).values({
                mailboxId,
                folder,
                lastUid: msg.uid,
              });
            }
          }
        } finally {
          lock.release();
        }
      }

      await db.update(jobs)
        .set({
          status: "success",
          finishedAt: new Date().toISOString(),
          statsJson: JSON.stringify(stats),
        })
        .where(eq(jobs.id, job.id));

    } catch (error: any) {
      logger.error({ error, mailboxId }, "Mailbox sync failed");
      await db.update(jobs)
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

  findAttachmentParts(structure: any, parts: any[] = []): any[] {
    if (structure.disposition?.toLowerCase() === "attachment" || (structure.type && structure.type.toLowerCase() !== "text" && !structure.childNodes)) {
        parts.push({
            part: structure.part,
            filename: structure.parameters?.filename || structure.dispositionParameters?.filename || "unnamed",
            mime: `${structure.type}/${structure.subtype}`.toLowerCase(),
            size: structure.size || 0
        });
    }
    if (structure.childNodes) {
        for (const child of structure.childNodes) {
            this.findAttachmentParts(child, parts);
        }
    }
    return parts;
  }
}
