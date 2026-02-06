import { exists } from "node:fs/promises";
import { join } from "node:path";
import { desc, eq } from "drizzle-orm";
import { db, runMigrations } from "./db";
import { downloads, jobs, mailboxes, users } from "./db/schema";
import { logger } from "./services/logger";
import { MailboxEngine } from "./services/mailbox-engine";
import { scheduler } from "./services/scheduler";
import {
	decrypt,
	encrypt,
	getAppSecretValue,
	hashPassword,
	verifyPassword,
} from "./services/security";

const engine = new MailboxEngine();

// Session management
const SESSION_COOKIE = "mailboxed_session";

async function getSession(req: Request) {
	const cookie = req.headers.get("cookie");
	if (!cookie) return null;
	const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
	if (!match) return null;

	// In a real app, verify a JWT or check DB.
	// For simplicity here, we'll use the user ID as the session token (NOT SECURE for production, but following the MVP style)
	return match[1];
}

// Simple Auth Middleware
async function authenticate(req: Request) {
	const userId = await getSession(req);
	if (!userId) return null;

	const user = await db.query.users.findFirst({
		where: eq(users.id, parseInt(userId)),
	});
	return user || null;
}

function sanitizeMailboxPayload(input: any) {
	const out: any = {};

	// Allowed fields from schema (except id, userId which is set separately)
	const allowedKeys = new Set([
		"name",
		"host",
		"port",
		"tlsMode",
		"username",
		"password", // transient; will be turned into passwordEnc
		"passwordEnc",
		"basePath",
		"folderListJson",
		"filtersJson",
		"dedupeMode",
		"syncMode",
		"enabled",
		"pollIntervalSec",
		"busyPolicy",
	]);

	for (const [k, v] of Object.entries(input || {})) {
		if (!allowedKeys.has(k)) continue;
		out[k] = v;
	}

	// Coercions
	if (out.port != null) out.port = Number(out.port);
	if (out.pollIntervalSec != null)
		out.pollIntervalSec = Number(out.pollIntervalSec);
	if (out.enabled != null) out.enabled = Boolean(out.enabled);

	// Ensure JSON/text columns are strings
	if (out.folderListJson != null && typeof out.folderListJson !== "string") {
		try {
			out.folderListJson = JSON.stringify(out.folderListJson);
		} catch {
			out.folderListJson = "[]";
		}
	}
	if (out.filtersJson != null && typeof out.filtersJson !== "string") {
		try {
			out.filtersJson = JSON.stringify(out.filtersJson);
		} catch {
			out.filtersJson = "{}";
		}
	}

	return out;
}

export const app = {
	fetch: async (req: Request) => {
		const url = new URL(req.url);
		const path = url.pathname;

		// Health check
		if (path === "/healthz") return new Response("OK");

		// API Routes
		if (path.startsWith("/api")) {
			// Auth
			if (path === "/api/auth/login" && req.method === "POST") {
				const body = (await req.json()) as any;
				const user = await db.query.users.findFirst({
					where: eq(users.email, body.email),
				});
				if (user && (await verifyPassword(body.password, user.passwordHash))) {
					const _appSecret = await getAppSecretValue();
					return new Response(
						JSON.stringify({ success: true, user: { email: user.email } }),
						{
							headers: {
								"Content-Type": "application/json",
								"Set-Cookie": `${SESSION_COOKIE}=${user.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`, // 30 days
							},
						},
					);
				}
				return new Response("Unauthorized", { status: 401 });
			}

			if (path === "/api/auth/logout" && req.method === "POST") {
				return new Response(JSON.stringify({ success: true }), {
					headers: {
						"Content-Type": "application/json",
						"Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
					},
				});
			}

			if (path === "/api/auth/me" && req.method === "GET") {
				const user = await authenticate(req);
				if (user) {
					return Response.json({ email: user.email });
				}
				return new Response("Unauthorized", { status: 401 });
			}

			// Everything else requires auth
			const currentUser = await authenticate(req);
			if (!currentUser) return new Response("Unauthorized", { status: 401 });

			if (path === "/api/mailboxes/test-connection" && req.method === "POST") {
				const body = (await req.json()) as any;
				// If it's an existing mailbox and password is not provided, decrypt it
				if (body.id && !body.password) {
					const mailbox = await db.query.mailboxes.findFirst({
						where: eq(mailboxes.id, body.id),
					});
					if (mailbox) {
						body.password = await decrypt(mailbox.passwordEnc);
					}
				}
				const result = await engine.testConnection(body);
				return Response.json(result);
			}

			// Mailboxes
			if (path === "/api/mailboxes" && req.method === "GET") {
				const result = await db.query.mailboxes.findMany({
					where: eq(mailboxes.userId, currentUser.id),
				});
				const withNextRun = result.map((mb) => ({
					...mb,
					nextRun: scheduler.getNextRun(mb.id),
				}));
				return Response.json(withNextRun);
			}

			if (path === "/api/mailboxes" && req.method === "POST") {
				const raw = await req.json();
				const body = sanitizeMailboxPayload(raw);
				// Encrypt password before saving
				if (body.password) {
					body.passwordEnc = await encrypt(body.password);
					delete body.password;
				}

				body.userId = currentUser.id;
				const [newMailbox] = await db
					.insert(mailboxes)
					.values(body)
					.returning();
				if (newMailbox.enabled) {
					scheduler.scheduleMailbox(newMailbox.id, newMailbox.pollIntervalSec);
				}
				return Response.json(newMailbox);
			}

			if (path.match(/\/api\/mailboxes\/\d+/) && req.method === "GET") {
				const id = parseInt(path.split("/")[3]);
				const result = await db.query.mailboxes.findFirst({
					where: eq(mailboxes.id, id),
				});
				if (result) {
					return Response.json({
						...result,
						nextRun: scheduler.getNextRun(result.id),
					});
				}
				return Response.json(result);
			}

			if (path.match(/\/api\/mailboxes\/\d+/) && req.method === "PUT") {
				const id = parseInt(path.split("/")[3]);
				const raw = await req.json();
				const body = sanitizeMailboxPayload(raw);

				if (body.password) {
					body.passwordEnc = await encrypt(body.password);
					delete body.password;
				}

				const [updated] = await db
					.update(mailboxes)
					.set(body)
					.where(eq(mailboxes.id, id))
					.returning();
				if (updated.enabled) {
					scheduler.scheduleMailbox(updated.id, updated.pollIntervalSec);
				} else {
					scheduler.stopMailbox(updated.id);
				}
				return Response.json(updated);
			}

			if (path.match(/\/api\/mailboxes\/\d+/) && req.method === "DELETE") {
				const id = parseInt(path.split("/")[3]);
				await db.delete(mailboxes).where(eq(mailboxes.id, id));
				scheduler.stopMailbox(id);
				return Response.json({ success: true });
			}

			if (path.match(/\/api\/mailboxes\/\d+\/sync/) && req.method === "POST") {
				const id = parseInt(path.split("/")[3]);
				// Trigger manual sync in background
				engine.sync(id, "manual");
				return Response.json({ status: "triggered" });
			}

			if (path.match(/\/api\/mailboxes\/\d+\/reset/) && req.method === "POST") {
				const id = parseInt(path.split("/")[3]);
				await engine.reset(id);
				// Trigger manual sync in background after reset
				engine.sync(id, "manual");
				return Response.json({ status: "reset_and_triggered" });
			}

			// Downloads
			if (path === "/api/downloads" && req.method === "GET") {
				const q = url.searchParams.get("q")?.toLowerCase();
				let result = await db.query.downloads.findMany({
					orderBy: [desc(downloads.downloadedAt)],
					limit: 100,
				});

				if (q) {
					result = result.filter(
						(d) =>
							d.filename.toLowerCase().includes(q) ||
							d.subject?.toLowerCase().includes(q) ||
							d.from?.toLowerCase().includes(q),
					);
				}

				return Response.json(result);
			}

			if (
				path.match(/\/api\/downloads\/\d+\/content/) &&
				req.method === "GET"
			) {
				const id = parseInt(path.split("/")[3]);
				const download = await db.query.downloads.findFirst({
					where: eq(downloads.id, id),
				});
				if (!download) return new Response("Not found", { status: 404 });

				let content: Buffer | Uint8Array;
				const fileExists = await exists(download.path);

				if (fileExists) {
					content = await Bun.file(download.path)
						.arrayBuffer()
						.then((ab) => new Uint8Array(ab));
				} else {
					try {
						content = await engine.fetchAttachment(
							download.mailboxId,
							download.folder,
							download.messageUid,
							download.attachmentPartId,
						);
					} catch (error: any) {
						logger.error(
							{
								err: { message: error.message, stack: error.stack, ...error },
								downloadId: id,
							},
							"Failed to fetch attachment from IMAP",
						);
						return new Response(
							`Failed to fetch attachment: ${error.message}`,
							{ status: 500 },
						);
					}
				}

				return new Response(content, {
					headers: {
						"Content-Type": download.mime,
						"Content-Disposition": `inline; filename="${encodeURIComponent(download.filename)}"`,
					},
				});
			}

			// Jobs
			if (path === "/api/jobs" && req.method === "GET") {
				const result = await db.query.jobs.findMany({
					orderBy: [desc(jobs.startedAt)],
					limit: 20,
				});
				return Response.json(result);
			}

			if (path === "/api/jobs/abort-all" && req.method === "POST") {
				if (!(await authenticate(req)))
					return new Response("Unauthorized", { status: 401 });
				engine.abortAll();
				return Response.json({ success: true });
			}

			if (path === "/api/jobs/restart-all" && req.method === "POST") {
				if (!(await authenticate(req)))
					return new Response("Unauthorized", { status: 401 });
				const allMailboxes = await db.query.mailboxes.findMany({
					where: eq(mailboxes.enabled, true),
				});
				for (const mb of allMailboxes) {
					engine.sync(mb.id, "manual"); // Run in background
				}
				return Response.json({ success: true, count: allMailboxes.length });
			}

			if (path === "/api/jobs/scheduler/pause" && req.method === "POST") {
				if (!(await authenticate(req)))
					return new Response("Unauthorized", { status: 401 });
				scheduler.pause();
				return Response.json({ success: true });
			}

			if (path === "/api/jobs/scheduler/resume" && req.method === "POST") {
				if (!(await authenticate(req)))
					return new Response("Unauthorized", { status: 401 });
				scheduler.resume();
				return Response.json({ success: true });
			}

			if (path === "/api/jobs/scheduler/status" && req.method === "GET") {
				if (!(await authenticate(req)))
					return new Response("Unauthorized", { status: 401 });
				return Response.json({ paused: scheduler.isPaused() });
			}

			// Stats
			if (path === "/api/stats" && req.method === "GET") {
				const allDownloads = await db
					.select({
						size: downloads.size,
						mime: downloads.mime,
					})
					.from(downloads);

				const allJobs = await db
					.select({
						status: jobs.status,
					})
					.from(jobs);

				const totalFiles = allDownloads.length;
				const totalSize = allDownloads.reduce(
					(acc, d) => acc + (d.size || 0),
					0,
				);

				const mailboxCount = (await db.select().from(mailboxes)).length;
				const activeMailboxes = (
					await db.select().from(mailboxes).where(eq(mailboxes.enabled, true))
				).length;

				const successJobs = allJobs.filter(
					(j) => j.status === "success",
				).length;
				const totalJobs = allJobs.length;
				const successRate = totalJobs > 0 ? (successJobs / totalJobs) * 100 : 0;

				// MIME breakdown (friendly labels)
				const toFriendlyType = (mime?: string): string => {
					if (!mime) return "Unknown";
					const [type, subtypeRaw] = mime.split("/");
					const subtype = (subtypeRaw || "").toLowerCase();

					// Common explicit mappings
					if (subtype === "pdf") return "PDF";
					if (subtype === "jpeg" || subtype === "jpg") return "JPEG";
					if (subtype === "png") return "PNG";
					if (subtype === "gif") return "GIF";
					if (subtype === "svg+xml") return "SVG";
					if (subtype === "plain") return "Text";
					if (subtype === "html") return "HTML";
					if (subtype === "csv") return "CSV";
					if (subtype.includes("zip")) return "ZIP";
					if (subtype.includes("rar")) return "RAR";
					if (subtype.includes("7z")) return "7‑Zip";
					if (
						subtype.includes("msword") ||
						subtype.includes("wordprocessingml")
					)
						return "Word";
					if (
						subtype.includes("vnd.ms-excel") ||
						subtype.includes("spreadsheetml")
					)
						return "Excel";
					if (
						subtype.includes("vnd.ms-powerpoint") ||
						subtype.includes("presentationml")
					)
						return "PowerPoint";
					if (subtype === "json") return "JSON";
					if (subtype === "xml") return "XML";
					if (subtype === "octet-stream") return "Binary";

					// Fallbacks
					if (subtype) return subtype.toUpperCase();
					return type
						? type.charAt(0).toUpperCase() + type.slice(1)
						: "Unknown";
				};

				const mimeBreakdown: Record<string, number> = {};
				allDownloads.forEach((d) => {
					const label = toFriendlyType(d.mime || undefined);
					mimeBreakdown[label] = (mimeBreakdown[label] || 0) + 1;
				});

				// Downloads over time (last 30 days)
				const thirtyDaysAgo = new Date();
				thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

				const recentDownloads = await db
					.select({
						downloadedAt: downloads.downloadedAt,
					})
					.from(downloads);
				// Note: Filter in memory for simplicity in this MVP, or use SQL if performance is an issue

				const downloadsByDay: Record<string, number> = {};
				// Initialize last 30 days with 0
				for (let i = 0; i < 30; i++) {
					const d = new Date();
					d.setDate(d.getDate() - i);
					downloadsByDay[d.toISOString().split("T")[0]] = 0;
				}

				recentDownloads.forEach((d) => {
					const date = d.downloadedAt.split(" ")[0]; // YYYY-MM-DD
					if (downloadsByDay[date] !== undefined) {
						downloadsByDay[date]++;
					}
				});

				const history = Object.entries(downloadsByDay)
					.map(([date, count]) => ({ date, count }))
					.sort((a, b) => a.date.localeCompare(b.date));

				const lastDownloads = await db.query.downloads.findMany({
					orderBy: [desc(downloads.downloadedAt)],
					limit: 10,
				});

				return Response.json({
					totalFiles,
					totalSize,
					mailboxCount,
					activeMailboxes,
					successRate: Math.round(successRate),
					mimeBreakdown: Object.entries(mimeBreakdown).map(([name, value]) => ({
						name,
						value,
					})),
					history,
					lastDownloads,
				});
			}
		}

		// Static frontend (SPA) serving
		if (req.method === "GET" && !path.startsWith("/api")) {
			const clientDir = process.env.CLIENT_DIR || "static";
			const rel = path === "/" ? "index.html" : path.slice(1);
			const fullPath = join(clientDir, rel);

			try {
				if (await exists(fullPath)) {
					return new Response(Bun.file(fullPath));
				}
			} catch {}

			// SPA fallback
			const indexHtml = join(clientDir, "index.html");
			if (await exists(indexHtml)) {
				return new Response(Bun.file(indexHtml), {
					headers: { "Content-Type": "text/html" },
				});
			}
		}

		return new Response("Not Found", { status: 404 });
	},
};

if (process.env.NODE_ENV !== "test") {
	(async () => {
		// Run migrations before anything else
		try {
			await runMigrations();
		} catch (err) {
			logger.error(err, "Failed to run migrations");
			process.exit(1);
		}

		// Seed initial user if none exists
		const userCount = (await db.select().from(users)).length;
		if (userCount === 0) {
			const email = process.env.DEFAULT_USER_EMAIL || "admin@example.com";
			const password = process.env.DEFAULT_USER_PASSWORD || "admin";
			const passwordHash = await hashPassword(password);
			await db.insert(users).values({
				email,
				passwordHash,
			});
			const pw = password.replace(/./g, "*");
			logger.info(
				{ email, pw },
				"Created initial admin user. Please change password after login.",
			);
		}

		const server = Bun.serve({
			port: parseInt(process.env.PORT || "3000"),
			fetch: app.fetch,
		});

		logger.debug(`Server started on http://localhost:${server.port}`);

		// Initialize Scheduler
		scheduler.init();
	})();
}
