import { sqlite } from "../src/db";
import { readFile } from "fs/promises";
import { join } from "path";

export async function setupTestDb() {
    // Drop all tables
    const tables = ["downloads", "jobs", "checkpoints", "mailboxes", "users"];
    for (const table of tables) {
        sqlite.run(`DROP TABLE IF EXISTS ${table}`);
    }
    
    // Run migrations
    const migrations = ["0000_petite_jazinda.sql", "0001_add_job_metadata.sql"];
    for (const file of migrations) {
        const migrationFile = await readFile(join(process.cwd(), "drizzle", file), "utf-8");
        for (const statement of migrationFile.split(";")) {
            const clean = statement.split("--> statement-breakpoint")[0].trim();
            if (clean) {
                sqlite.run(clean);
            }
            // If there's more after breakpoint in the same "statement" (unlikely with split(';'))
            // but let's be robust
            const parts = statement.split("--> statement-breakpoint");
            if (parts.length > 1) {
                for (let i = 1; i < parts.length; i++) {
                    const p = parts[i].trim();
                    if (p) sqlite.run(p);
                }
            }
        }
    }
}
