import { expect, test, describe, beforeEach } from "bun:test";
import { app } from "../src/index";
import { setupTestDb } from "./test-utils";
import { db } from "../src/db";
import { users, mailboxes } from "../src/db/schema";
import { hashPassword } from "../src/services/security";

describe("API Endpoints", () => {
  beforeEach(async () => {
    await setupTestDb();
    // Create a test user
    const passwordHash = await hashPassword("password123");
    await db.insert(users).values({
      id: 1,
      email: "test@example.com",
      passwordHash,
    });
  });

  const login = async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await app.fetch(req);
    const cookie = res.headers.get("Set-Cookie");
    return cookie?.split(";")[0];
  };

  test("GET /healthz should return OK", async () => {
    const req = new Request("http://localhost/healthz");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  describe("Authentication", () => {
    test("POST /api/auth/login should return success and set cookie", async () => {
      const req = new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "test@example.com", password: "password123" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(res.headers.get("Set-Cookie")).toContain("mailboxed_session=");
    });

    test("GET /api/auth/me should return current user when authenticated", async () => {
      const cookie = await login();
      const req = new Request("http://localhost/api/auth/me", {
        headers: { Cookie: cookie || "" },
      });
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.email).toBe("test@example.com");
    });

    test("POST /api/auth/logout should clear session", async () => {
      const req = new Request("http://localhost/api/auth/logout", {
        method: "POST",
      });
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });
  });

  describe("Mailboxes", () => {
    test("GET /api/mailboxes should return list of mailboxes", async () => {
      const cookie = await login();
      await db.insert(mailboxes).values({
        userId: 1,
        name: "Test Mailbox",
        host: "imap.example.com",
        port: 993,
        username: "testuser",
        passwordEnc: "some-encrypted-pass",
        basePath: "test",
      });

      const req = new Request("http://localhost/api/mailboxes", {
        headers: { Cookie: cookie || "" },
      });
      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Test Mailbox");
    });

    test("POST /api/mailboxes should create a new mailbox", async () => {
      const cookie = await login();
      const req = new Request("http://localhost/api/mailboxes", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            Cookie: cookie || "" 
        },
        body: JSON.stringify({
          name: "New Mailbox",
          host: "imap.test.com",
          port: 993,
          username: "newuser",
          password: "newpassword",
          basePath: "new",
          enabled: true,
          pollIntervalSec: 600,
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("New Mailbox");
      
      const inDb = await db.query.mailboxes.findFirst();
      expect(inDb).toBeDefined();
      expect(inDb?.name).toBe("New Mailbox");
    });

    test("GET /api/mailboxes/:id should return a specific mailbox", async () => {
        const cookie = await login();
        const [inserted] = await db.insert(mailboxes).values({
          userId: 1,
          name: "Specific Mailbox",
          host: "imap.example.com",
          port: 993,
          username: "testuser",
          passwordEnc: "some-encrypted-pass",
          basePath: "test",
        }).returning();
  
        const req = new Request(`http://localhost/api/mailboxes/${inserted.id}`, {
          headers: { Cookie: cookie || "" },
        });
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBe(inserted.id);
        expect(data.name).toBe("Specific Mailbox");
    });

    test("PUT /api/mailboxes/:id should update a mailbox", async () => {
        const cookie = await login();
        const [inserted] = await db.insert(mailboxes).values({
          userId: 1,
          name: "Old Name",
          host: "imap.example.com",
          port: 993,
          username: "testuser",
          passwordEnc: "some-encrypted-pass",
          basePath: "test",
        }).returning();
  
        const req = new Request(`http://localhost/api/mailboxes/${inserted.id}`, {
          method: "PUT",
          headers: { 
              "Content-Type": "application/json",
              Cookie: cookie || "" 
          },
          body: JSON.stringify({
            name: "Updated Name",
          }),
        });
  
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.name).toBe("Updated Name");
    });

    test("DELETE /api/mailboxes/:id should remove a mailbox", async () => {
        const cookie = await login();
        const [inserted] = await db.insert(mailboxes).values({
          userId: 1,
          name: "To Be Deleted",
          host: "imap.example.com",
          port: 993,
          username: "testuser",
          passwordEnc: "some-encrypted-pass",
          basePath: "test",
        }).returning();
  
        const req = new Request(`http://localhost/api/mailboxes/${inserted.id}`, {
          method: "DELETE",
          headers: { Cookie: cookie || "" },
        });
  
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        
        const inDb = await db.query.mailboxes.findFirst();
        expect(inDb).toBeUndefined();
    });

    test("POST /api/mailboxes/:id/sync should trigger a sync", async () => {
        const cookie = await login();
        const [inserted] = await db.insert(mailboxes).values({
          userId: 1,
          name: "Sync Mailbox",
          host: "imap.example.com",
          port: 993,
          username: "testuser",
          passwordEnc: "some-encrypted-pass",
          basePath: "test",
        }).returning();
  
        const req = new Request(`http://localhost/api/mailboxes/${inserted.id}/sync`, {
          method: "POST",
          headers: { Cookie: cookie || "" },
        });
  
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.status).toBe("triggered");
    });
  });

  describe("Other Data Endpoints", () => {
    test("GET /api/downloads should return downloads", async () => {
        const cookie = await login();
        const req = new Request("http://localhost/api/downloads", {
          headers: { Cookie: cookie || "" },
        });
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    test("GET /api/jobs should return jobs", async () => {
        const cookie = await login();
        const req = new Request("http://localhost/api/jobs", {
          headers: { Cookie: cookie || "" },
        });
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    test("GET /api/stats should return statistics", async () => {
        const cookie = await login();
        const req = new Request("http://localhost/api/stats", {
          headers: { Cookie: cookie || "" },
        });
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty("totalFiles");
        expect(data).toHaveProperty("totalSize");
    });
  });

  describe("Job Control Endpoints", () => {
    test("POST /api/jobs/abort-all should return 200", async () => {
        const cookie = await login();
        const req = new Request("http://localhost/api/jobs/abort-all", {
            method: "POST",
            headers: { Cookie: cookie || "" },
        });
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
    });

    test("POST /api/jobs/restart-all should return 200", async () => {
        const cookie = await login();
        const req = new Request("http://localhost/api/jobs/restart-all", {
            method: "POST",
            headers: { Cookie: cookie || "" },
        });
        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
    });

    test("Scheduler endpoints should work", async () => {
        const cookie = await login();
        
        // Pause
        const pauseReq = new Request("http://localhost/api/jobs/scheduler/pause", {
            method: "POST",
            headers: { Cookie: cookie || "" },
        });
        let res = await app.fetch(pauseReq);
        expect(res.status).toBe(200);

        // Status
        const statusReq = new Request("http://localhost/api/jobs/scheduler/status", {
            headers: { Cookie: cookie || "" },
        });
        res = await app.fetch(statusReq);
        expect(res.status).toBe(200);
        let data = await res.json();
        expect(data.paused).toBe(true);

        // Resume
        const resumeReq = new Request("http://localhost/api/jobs/scheduler/resume", {
            method: "POST",
            headers: { Cookie: cookie || "" },
        });
        res = await app.fetch(resumeReq);
        expect(res.status).toBe(200);

        // Status again
        res = await app.fetch(statusReq);
        data = await res.json();
        expect(data.paused).toBe(false);
    });
  });

  describe("Security/Authorization", () => {
    test("GET /api/mailboxes should return 401 if not authenticated", async () => {
        const req = new Request("http://localhost/api/mailboxes");
        const res = await app.fetch(req);
        expect(res.status).toBe(401);
    });

    test("POST /api/mailboxes should return 401 if not authenticated", async () => {
        const req = new Request("http://localhost/api/mailboxes", { method: "POST" });
        const res = await app.fetch(req);
        expect(res.status).toBe(401);
    });

    test("GET /api/downloads should return 401 if not authenticated", async () => {
        const req = new Request("http://localhost/api/downloads");
        const res = await app.fetch(req);
        expect(res.status).toBe(401);
    });
  });
});
