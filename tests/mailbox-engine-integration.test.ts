import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test";
import { MailboxEngine } from "../src/services/mailbox-engine";
import { db } from "../src/db";
import { mailboxes, jobs, checkpoints, downloads } from "../src/db/schema";
import { encrypt } from "../src/services/security";
import { setupTestDb } from "./test-utils";
import { rm, mkdir } from "fs/promises";

describe("MailboxEngine Integration", () => {
  const testDownloadRoot = "test-downloads-integration";
  
  beforeEach(async () => {
    process.env.IMAP_CRED_MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.DOWNLOAD_ROOT = testDownloadRoot;
    await setupTestDb();
    await mkdir(testDownloadRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDownloadRoot, { recursive: true, force: true });
  });

  test("should complete a full sync with mocked IMAP client", async () => {
    // 1. Setup test data in DB
    const [mailbox] = await db.insert(mailboxes).values({
      userId: 1,
      name: "Test",
      host: "localhost",
      port: 993,
      username: "user",
      passwordEnc: await encrypt("pass"),
      basePath: "test",
      folderListJson: JSON.stringify(["INBOX"]),
      filtersJson: "{}",
      enabled: true,
    }).returning();

    // 2. Mock IMAP client
    const mockClient = {
      connect: mock(async () => {}),
      logout: mock(async () => {}),
      getMailboxLock: mock(async () => ({ release: () => {} })),
      search: mock(async () => [1]),
      fetch: function* () {
        yield {
          uid: 1,
          envelope: { date: new Date(), subject: "Test Attachment", from: [{ address: "sender@test.com" }] },
          bodyStructure: {
            part: "1",
            type: "application",
            subtype: "octet-stream",
            disposition: "attachment",
            parameters: { filename: "test.bin" },
            size: 12
          }
        };
      },
      download: mock(async () => ({ content: [Buffer.from("hello world")] })),
      status: mock(async () => ({ uidNext: 2 })),
    };

    const engine = new MailboxEngine(() => mockClient as any);
    await engine.sync(mailbox.id, "manual", true);

    // 3. Assertions
    const jobRecord = await db.query.jobs.findFirst();
    expect(jobRecord?.status).toBe("success");
    
    const stats = JSON.parse(jobRecord?.statsJson || "{}");
    expect(stats.scannedMessages).toBe(1);
    expect(stats.savedAttachments).toBe(1);

    const downloadRecords = await db.query.downloads.findMany();
    expect(downloadRecords).toHaveLength(1);
    expect(downloadRecords[0].filename).toBe("test.bin");

    const checkpointRecord = await db.query.checkpoints.findFirst();
    expect(checkpointRecord?.lastUid).toBe(1);
  });

  test("should resume from checkpoint", async () => {
      const [mailbox] = await db.insert(mailboxes).values({
          userId: 1,
          name: "Test Resume",
          host: "localhost",
          port: 993,
          username: "user",
          passwordEnc: await encrypt("pass"),
          basePath: "test",
          folderListJson: JSON.stringify(["INBOX"]),
          filtersJson: "{}",
          enabled: true,
      }).returning();

      await db.insert(checkpoints).values({
          mailboxId: mailbox.id,
          folder: "INBOX",
          lastUid: 10,
      });

      let capturedCriteria: any = null;

      const mockClient = {
          connect: mock(async () => {}),
          logout: mock(async () => {}),
          getMailboxLock: mock(async () => ({ release: () => {} })),
          search: mock(async (criteria: any) => {
              capturedCriteria = criteria;
              return [];
          }),
          fetch: function* (criteria: any) {
              // Should not be called if search returns empty
          },
          status: mock(async () => ({ uidNext: 11 })),
      };

      const engine = new MailboxEngine(() => mockClient as any);
      await engine.sync(mailbox.id, "manual", true);

      expect(capturedCriteria).toEqual({ uid: "11:*" });
  });

  test("should handle connection failure and record it in job", async () => {
    const [mailbox] = await db.insert(mailboxes).values({
      userId: 1,
      name: "Fail Test",
      host: "localhost",
      port: 993,
      username: "user",
      passwordEnc: await encrypt("pass"),
      basePath: "test",
      folderListJson: JSON.stringify(["INBOX"]),
      enabled: true,
    }).returning();

    const mockClient = {
      connect: mock(async () => { throw new Error("Connection timed out"); }),
      logout: mock(async () => {}),
    };

    const engine = new MailboxEngine(() => mockClient as any);
    // Use a small retry delay for tests if possible, but here it's hardcoded in engine.
    // For this test, it will take ~2+4+8 = 14s if we let it run.
    // Let's mock setTimeout to speed it up.
    const originalTimeout = global.setTimeout;
    (global as any).setTimeout = (cb: any) => cb();

    await engine.sync(mailbox.id, "manual", true);

    (global as any).setTimeout = originalTimeout;

    const jobRecord = await db.query.jobs.findFirst();
    expect(jobRecord?.status).toBe("failed");
    expect(jobRecord?.errorText).toContain("Connection timed out");
  });
});
