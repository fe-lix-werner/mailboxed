import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

const dbPath = process.env.DB_PATH || "mailboxed.sqlite";
export const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });
