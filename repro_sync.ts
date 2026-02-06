
import { MailboxEngine } from "./src/services/mailbox-engine";
import { db } from "./src/db";
import { mailboxes } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function run() {
    const engine = new MailboxEngine();
    console.log("Starting sync for mailbox 1...");
    try {
        await engine.sync(1, "manual", true);
        console.log("Sync finished.");
    } catch (e) {
        console.error("Sync failed with error:", e);
    } finally {
        // Explicitly close the database connection to allow the process to exit
        const { sqlite } = await import("./src/db");
        sqlite.close();
    }
    process.exit(0);
}

run();
