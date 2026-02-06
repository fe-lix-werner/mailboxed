import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

function resolveDefaultDbPath(): string {
	// 1) Highest priority: explicit env var
	if (process.env.DB_PATH && process.env.DB_PATH.trim().length > 0) {
		return process.env.DB_PATH;
	}

	// 2) Try common locations relative to the runtime and bundle locations
	// - process.cwd(): when app is started from project root
	// - module dir "../mailboxed.sqlite": when running bundled file from dist/
	// - module dir "../../mailboxed.sqlite": fallback for rare layouts
	const cwdCandidate = path.resolve(process.cwd(), "mailboxed.sqlite");
	if (existsSync(cwdCandidate)) return cwdCandidate;

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);

	const distSibling = path.resolve(__dirname, "../mailboxed.sqlite");
	if (existsSync(distSibling)) return distSibling;

	const rootFallback = path.resolve(__dirname, "../../mailboxed.sqlite");
	if (existsSync(rootFallback)) return rootFallback;

	// 3) If none exist, default to CWD so a new DB is created there
	return cwdCandidate;
}

const dbPath = resolveDefaultDbPath();
export const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

export async function runMigrations() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);

	// Resolve migrations path
	// In dev: src/db/index.ts -> drizzle/ is at ../../drizzle
	// In bundle: dist/index.js -> drizzle/ might be at ./drizzle or ../drizzle
	const migrationPaths = [
		path.resolve(process.cwd(), "drizzle"),
		path.resolve(__dirname, "../../drizzle"),
		path.resolve(__dirname, "../drizzle"),
	];

	let migrationPath = migrationPaths[0];
	for (const p of migrationPaths) {
		if (existsSync(p)) {
			migrationPath = p;
			break;
		}
	}

	console.log(`[DB] Running migrations from ${migrationPath}...`);
	await migrate(db, { migrationsFolder: migrationPath });
	console.log(`[DB] Migrations completed.`);
}

if (import.meta.main && process.argv.includes("--migrate")) {
	await runMigrations();
	process.exit(0);
}
