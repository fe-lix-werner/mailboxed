import { Cron } from "croner";
import { db } from "../db";
import { mailboxes } from "../db/schema";
import { eq } from "drizzle-orm";
import { MailboxEngine } from "./mailbox-engine";
import { logger } from "./logger";

export class Scheduler {
  private jobs: Map<number, Cron> = new Map();
  private engine: MailboxEngine;
  private paused: boolean = false;

  constructor(engine?: MailboxEngine) {
    this.engine = engine || new MailboxEngine();
  }

  async init() {
    const allMailboxes = await db.query.mailboxes.findMany({
      where: eq(mailboxes.enabled, true),
    });

    for (const mb of allMailboxes) {
      this.scheduleMailbox(mb.id, mb.pollIntervalSec);
    }
    
    logger.debug(`Scheduler initialized with ${allMailboxes.length} active mailboxes`);
  }

  pause() {
    this.paused = true;
    logger.info("Scheduler paused");
  }

  resume() {
    this.paused = false;
    logger.info("Scheduler resumed");
  }

  isPaused() {
    return this.paused;
  }

  scheduleMailbox(mailboxId: number, intervalSec: number) {
    // Clean up existing job if any
    if (this.jobs.has(mailboxId)) {
      this.jobs.get(mailboxId)?.stop();
    }

    // intervalSec to cron-like interval (every X seconds)
    // Croner supports numeric intervals in seconds if passed as a number, 
    // but better use the "interval" feature or a simple setInterval if it's just seconds.
    // Actually Croner supports `* * * * * *` for seconds if enabled.
    
    let cronPattern: string;
    if (intervalSec < 60) {
      cronPattern = `*/${intervalSec} * * * * *`;
    } else {
      const minutes = Math.floor(intervalSec / 60);
      cronPattern = `0 */${minutes} * * * *`;
    }
    
    const job = new Cron(cronPattern, {
      seconds: true,
    }, async () => {
      if (this.paused) {
        logger.debug({ mailboxId }, "Scheduler is paused, skipping sync");
        return;
      }
      logger.debug({ mailboxId }, "Starting scheduled sync");
      await this.engine.sync(mailboxId, "poll");
    });

    this.jobs.set(mailboxId, job);
  }

  getNextRun(mailboxId: number): Date | null {
    const job = this.jobs.get(mailboxId);
    return job ? job.nextRun() : null;
  }

  stopMailbox(mailboxId: number) {
    if (this.jobs.has(mailboxId)) {
      this.jobs.get(mailboxId)?.stop();
      this.jobs.delete(mailboxId);
    }
  }
}

export const scheduler = new Scheduler();
