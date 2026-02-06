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
    const migrationFile = await readFile(join(process.cwd(), "drizzle/0000_petite_jazinda.sql"), "utf-8");
    for (const statement of migrationFile.split(";")) {
        if (statement.trim()) {
            sqlite.run(statement);
        }
    }
}
