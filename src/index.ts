import { db } from "./db";
import { scheduler } from "./services/scheduler";
import { logger } from "./services/logger";
import { hashPassword, verifyPassword, encrypt, decrypt } from "./services/security";
import { users, mailboxes, jobs, downloads } from "./db/schema";
import { eq, desc } from "drizzle-orm";
import { MailboxEngine } from "./services/mailbox-engine";

const engine = new MailboxEngine();

// Simple Auth Middleware (Mock for now, real session logic needed)
async function authenticate(req: Request) {
  // In a real app, check cookies/session
  // For this MVP, we might use a simple token or header if cookies are not yet set up
  return true; 
}

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Health check
    if (path === "/healthz") return new Response("OK");

    // Static files (Frontend will be served from here later)
    // if (path.startsWith("/static")) ...

    // API Routes
    if (path.startsWith("/api")) {
      // Auth
      if (path === "/api/auth/login" && req.method === "POST") {
        const body = await req.json();
        const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
        if (user && await verifyPassword(body.password, user.passwordHash)) {
          return Response.json({ success: true, user: { email: user.email } });
        }
        return new Response("Unauthorized", { status: 401 });
      }

      // Everything else requires auth
      if (!await authenticate(req)) return new Response("Unauthorized", { status: 401 });

      // Mailboxes
      if (path === "/api/mailboxes" && req.method === "GET") {
        const result = await db.query.mailboxes.findMany();
        return Response.json(result);
      }

      if (path === "/api/mailboxes" && req.method === "POST") {
        const body = await req.json();
        // Encrypt password before saving
        body.passwordEnc = encrypt(body.password);
        delete body.password;
        
        const [newMailbox] = await db.insert(mailboxes).values(body).returning();
        if (newMailbox.enabled) {
          scheduler.scheduleMailbox(newMailbox.id, newMailbox.pollIntervalSec);
        }
        return Response.json(newMailbox);
      }

      if (path.match(/\/api\/mailboxes\/\d+/) && req.method === "GET") {
        const id = parseInt(path.split("/")[3]);
        const result = await db.query.mailboxes.findFirst({ where: eq(mailboxes.id, id) });
        return Response.json(result);
      }

      if (path.match(/\/api\/mailboxes\/\d+\/sync/) && req.method === "POST") {
        const id = parseInt(path.split("/")[3]);
        // Trigger manual sync in background
        engine.sync(id, "manual"); 
        return Response.json({ status: "triggered" });
      }

      // Downloads
      if (path === "/api/downloads" && req.method === "GET") {
        const result = await db.query.downloads.findMany({
          orderBy: [desc(downloads.downloadedAt)],
          limit: 50,
        });
        return Response.json(result);
      }

      // Jobs
      if (path === "/api/jobs" && req.method === "GET") {
        const result = await db.query.jobs.findMany({
          orderBy: [desc(jobs.startedAt)],
          limit: 20,
        });
        return Response.json(result);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

logger.info(`Server started on http://localhost:${server.port}`);

// Initialize Scheduler
scheduler.init();
