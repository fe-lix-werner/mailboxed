import { expect, test, describe, mock, beforeEach } from "bun:test";
import { Scheduler } from "../src/services/scheduler";
import { MailboxEngine } from "../src/services/mailbox-engine";
import { db } from "../src/db";
import { mailboxes } from "../src/db/schema";
import { setupTestDb } from "./test-utils";

describe("Scheduler", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  test("should schedule and trigger sync", async () => {
    const mockEngine = {
      sync: mock(async () => {}),
    } as any;

    const scheduler = new Scheduler(mockEngine);
    
    // Insert an active mailbox
    await db.insert(mailboxes).values({
      userId: 1,
      name: "Scheduled",
      host: "localhost",
      port: 993,
      username: "user",
      passwordEnc: "enc",
      basePath: "test",
      enabled: true,
      pollIntervalSec: 1, // 1 second for test
    });

    await scheduler.init();

    // Wait for it to trigger (at least 1 second)
    await new Promise(resolve => setTimeout(resolve, 1100));

    expect(mockEngine.sync).toHaveBeenCalled();
    
    // Cleanup
    scheduler.stopMailbox(1);
  });
});
