import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { checkpoints, downloads, mailboxes } from "../src/db/schema";
import { logger } from "../src/services/logger";
import { MailboxEngine } from "../src/services/mailbox-engine";
import { encrypt } from "../src/services/security";
import { setupTestDb } from "./test-utils";

describe("MailboxEngine Integration", () => {
	const testDownloadRoot = "test-downloads-integration";

	beforeEach(async () => {
		process.env.IMAP_CRED_MASTER_KEY =
			"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
		process.env.DOWNLOAD_ROOT = testDownloadRoot;
		await setupTestDb();
		await mkdir(testDownloadRoot, { recursive: true });
	});

	afterEach(async () => {
		await rm(testDownloadRoot, { recursive: true, force: true });
	});

	test("should complete a full sync with mocked IMAP client", async () => {
		// 1. Setup test data in DB
		const [mailbox] = await db
			.insert(mailboxes)
			.values({
				userId: 1,
				name: "Test",
				host: "localhost",
				port: 993,
				username: "user",
				passwordEnc: await encrypt("pass"),
				basePath: "test",
				folderListJson: JSON.stringify(["INBOX"]),
				filtersJson: "{}",
				enabled: true,
			})
			.returning();

		// 2. Mock IMAP client
		const mockClient = {
			connect: mock(async () => {}),
			logout: mock(async () => {}),
			getMailboxLock: mock(async () => ({ release: () => {} })),
			search: mock(async () => [1]),
			fetch: function* () {
				yield {
					uid: 1,
					envelope: {
						date: new Date(),
						subject: "Test Attachment",
						from: [{ address: "sender@test.com" }],
					},
					bodyStructure: {
						part: "1",
						type: "application",
						subtype: "octet-stream",
						disposition: "attachment",
						parameters: { filename: "test.bin" },
						size: 12,
					},
				};
			},
			download: mock(async () => ({ content: [Buffer.from("hello world")] })),
			status: mock(async () => ({ uidNext: 2 })),
		};

		const engine = new MailboxEngine(() => mockClient as any);
		await engine.sync(mailbox.id, "manual", true);

		// 3. Assertions
		const jobRecord = await db.query.jobs.findFirst();
		expect(jobRecord?.status).toBe("success");

		const stats = JSON.parse((jobRecord?.statsJson as string) || "{}");
		expect(stats.scannedMessages).toBe(1);
		expect(stats.savedAttachments).toBe(1);

		const downloadRecords = await db.query.downloads.findMany();
		expect(downloadRecords).toHaveLength(1);
		expect(downloadRecords[0].filename).toBe("test.bin");

		const checkpointRecord = await db.query.checkpoints.findFirst();
		expect(checkpointRecord?.lastUid).toBe(1);
	});

	test("should resume from checkpoint", async () => {
		const [mailbox] = await db
			.insert(mailboxes)
			.values({
				userId: 1,
				name: "Test Resume",
				host: "localhost",
				port: 993,
				username: "user",
				passwordEnc: await encrypt("pass"),
				basePath: "test",
				folderListJson: JSON.stringify(["INBOX"]),
				filtersJson: "{}",
				enabled: true,
			})
			.returning();

		await db.insert(checkpoints).values({
			mailboxId: mailbox.id,
			folder: "INBOX",
			lastUid: 10,
		});

		let capturedCriteria: any = null;

		const mockClient = {
			connect: mock(async () => {}),
			logout: mock(async () => {}),
			getMailboxLock: mock(async () => ({ release: () => {} })),
			search: mock(async (criteria: any) => {
				capturedCriteria = criteria;
				return [];
			}),
			fetch: function* (_criteria: any) {
				// Should not be called if search returns empty
			},
			status: mock(async () => ({ uidNext: 11 })),
		};

		const engine = new MailboxEngine(() => mockClient as any);
		await engine.sync(mailbox.id, "manual", true);

		expect(capturedCriteria).toEqual({ uid: "11:*" });
	});

	test("should handle connection failure and record it in job", async () => {
		const [mailbox] = await db
			.insert(mailboxes)
			.values({
				userId: 1,
				name: "Fail Test",
				host: "localhost",
				port: 993,
				username: "user",
				passwordEnc: await encrypt("pass"),
				basePath: "test",
				folderListJson: JSON.stringify(["INBOX"]),
				enabled: true,
			})
			.returning();

		const mockClient = {
			connect: mock(async () => {
				throw new Error("Connection timed out");
			}),
			logout: mock(async () => {}),
		};

		const engine = new MailboxEngine(() => mockClient as any);
		// Use a small retry delay for tests if possible, but here it's hardcoded in engine.
		// For this test, it will take ~2+4+8 = 14s if we let it run.
		// Let's mock setTimeout to speed it up.
		const originalTimeout = global.setTimeout;
		(global as any).setTimeout = (cb: any) => cb();

		await engine.sync(mailbox.id, "manual", true);

		(global as any).setTimeout = originalTimeout;

		const jobRecord = await db.query.jobs.findFirst();
		expect(jobRecord?.status).toBe("failed");
		expect(jobRecord?.errorText).toContain("Connection timed out");
	});

	test("should apply size filters to the decoded file, not the encoded part", async () => {
		const [mailbox] = await db
			.insert(mailboxes)
			.values({
				userId: 1,
				name: "Test",
				host: "localhost",
				port: 993,
				username: "user",
				passwordEnc: await encrypt("pass"),
				basePath: "test",
				folderListJson: JSON.stringify(["INBOX"]),
				filtersJson: JSON.stringify({ maxSize: 11 }),
				enabled: true,
			})
			.returning();

		const mockClient = {
			connect: mock(async () => {}),
			logout: mock(async () => {}),
			getMailboxLock: mock(async () => ({ release: () => {} })),
			search: mock(async () => [1]),
			fetch: function* () {
				yield {
					uid: 1,
					envelope: { date: new Date(), subject: "Bill" },
					// A single-part message: the body itself is the PDF
					bodyStructure: {
						type: "application/pdf",
						encoding: "base64",
						disposition: "attachment",
						dispositionParameters: { filename: "bill.pdf" },
						size: 16,
					},
				};
			},
			download: mock(async () => ({ content: [Buffer.from("hello world")] })),
			status: mock(async () => ({ uidNext: 2 })),
		};

		const engine = new MailboxEngine(() => mockClient as any);
		await engine.sync(mailbox.id, "manual", true);

		const downloadRecords = await db.query.downloads.findMany();
		expect(downloadRecords).toHaveLength(1);
		expect(downloadRecords[0].size).toBe(11);
		const downloadArgs = mockClient.download.mock.calls[0] as unknown as any[];
		expect(downloadArgs[1]).toBe("1");
	});

	test("should log a filtered attachment with its reason at info level", async () => {
		const [mailbox] = await db
			.insert(mailboxes)
			.values({
				userId: 1,
				name: "Test",
				host: "localhost",
				port: 993,
				username: "user",
				passwordEnc: await encrypt("pass"),
				basePath: "test",
				folderListJson: JSON.stringify(["INBOX"]),
				filtersJson: JSON.stringify({ extensions: ["pdf"] }),
				enabled: true,
			})
			.returning();

		const mockClient = {
			connect: mock(async () => {}),
			logout: mock(async () => {}),
			getMailboxLock: mock(async () => ({ release: () => {} })),
			search: mock(async () => [7]),
			fetch: function* () {
				yield {
					uid: 7,
					envelope: { date: new Date(), subject: "Ihre Rechnung" },
					bodyStructure: {
						part: "1",
						type: "application/zip",
						disposition: "attachment",
						dispositionParameters: { filename: "rechnung.zip" },
						size: 16,
					},
				};
			},
			download: mock(async () => ({ content: [Buffer.from("hello world")] })),
			status: mock(async () => ({ uidNext: 8 })),
		};

		const infoSpy = spyOn(logger, "info");
		try {
			const engine = new MailboxEngine(() => mockClient as any);
			await engine.sync(mailbox.id, "manual", true);

			const calls = infoSpy.mock.calls as unknown as any[][];
			const skipCall = calls.find((call) => call[1] === "Attachment skipped");
			expect(skipCall).toBeDefined();
			expect(skipCall?.[0]).toMatchObject({
				mailboxId: mailbox.id,
				folder: "INBOX",
				uid: 7,
				filename: "rechnung.zip",
				subject: "Ihre Rechnung",
			});
			expect(skipCall?.[0].reason).toContain("extension");
		} finally {
			infoSpy.mockRestore();
		}

		expect(await db.query.downloads.findMany()).toHaveLength(0);
	});

	describe("checkpoint handling", () => {
		const createMailbox = async (extra: Record<string, unknown> = {}) => {
			const [mailbox] = await db
				.insert(mailboxes)
				.values({
					userId: 1,
					name: "Test",
					host: "localhost",
					port: 993,
					username: "user",
					passwordEnc: await encrypt("pass"),
					basePath: "test",
					...extra,
				})
				.returning();
			return mailbox;
		};

		const message = (uid: number, partCount = 1) => ({
			uid,
			envelope: { date: new Date(), subject: `Bill ${uid}` },
			bodyStructure: {
				type: "multipart/mixed",
				childNodes: Array.from({ length: partCount }, (_, i) => ({
					part: String(i + 1),
					type: "application/pdf",
					disposition: "attachment",
					dispositionParameters: { filename: `bill-${uid}-${i + 1}.pdf` },
					size: 16,
				})),
			},
		});

		const client = (overrides: Record<string, unknown>) =>
			({
				connect: async () => {},
				logout: async () => {},
				getMailboxLock: async () => ({ release: () => {} }),
				status: async () => ({ uidNext: 100 }),
				download: async (uid: number, part: string) => ({
					content: [Buffer.from(`content ${uid}/${part}`)],
				}),
				...overrides,
			}) as any;

		const lastUids = async () =>
			(await db.query.checkpoints.findMany()).map((c) => c.lastUid);
		const savedParts = async () =>
			(await db.query.downloads.findMany()).map(
				(d) => `${d.messageUid}/${d.attachmentPartId}`,
			);

		test("should not move past found messages the server returned no data for", async () => {
			const mailbox = await createMailbox();
			const engine = new MailboxEngine(() =>
				client({
					search: async () => [5, 6, 7],
					fetch: async function* () {},
				}),
			);
			await engine.sync(mailbox.id, "manual", true);

			expect(await lastUids()).toEqual([null]);
		});

		test("should stop before a gap in the fetched messages", async () => {
			const mailbox = await createMailbox();
			const engine = new MailboxEngine(() =>
				client({
					search: async () => [5, 6, 7],
					fetch: async function* () {
						yield message(5);
						yield message(7);
					},
				}),
			);
			await engine.sync(mailbox.id, "manual", true);

			expect(await lastUids()).toEqual([5]);
			expect(await savedParts()).toEqual(["5/1"]);
		});

		test("should fail the sync instead of skipping the folder when the search fails", async () => {
			const mailbox = await createMailbox();
			const engine = new MailboxEngine(() =>
				client({
					search: async () => false,
					fetch: async function* () {},
				}),
			);
			await engine.sync(mailbox.id, "manual", true);

			expect((await db.query.jobs.findFirst())?.status).toBe("failed");
			expect(await lastUids()).toEqual([null]);
		});

		test("should not count a message as done when the sync is aborted between its attachments", async () => {
			const mailbox = await createMailbox();
			let downloadCalls = 0;
			const engine: MailboxEngine = new MailboxEngine(() =>
				client({
					search: async () => [5, 6],
					fetch: async function* () {
						yield message(5, 3);
						yield message(6);
					},
					download: async () => {
						downloadCalls++;
						if (downloadCalls === 1) await engine.abort(mailbox.id);
						return { content: [Buffer.from("content")] };
					},
				}),
			);
			await engine.sync(mailbox.id, "manual", true);

			expect(await savedParts()).toEqual(["5/1"]);
			expect(await lastUids()).toEqual([null]);
		});

		test("should stop at the lowest failing UID even if the server answers out of order", async () => {
			const mailbox = await createMailbox();
			const engine = new MailboxEngine(() =>
				client({
					search: async () => [3, 4, 5],
					fetch: async function* () {
						yield message(5);
						yield message(3);
						yield message(4);
					},
					download: async (uid: number, part: string) => {
						if (uid === 4) throw new Error("boom");
						return { content: [Buffer.from(`content ${uid}/${part}`)] };
					},
				}),
			);
			await engine.sync(mailbox.id, "manual", true);

			expect(await savedParts()).toEqual(["3/1"]);
			expect(await lastUids()).toEqual([3]);
		}, 15000);

		test("should keep a single checkpoint for an empty folder", async () => {
			const mailbox = await createMailbox({ syncMode: "from-now-on" });
			const engine = new MailboxEngine(() =>
				client({
					search: async () => [],
					fetch: async function* () {},
					status: async () => ({ uidNext: 1 }),
				}),
			);
			for (let i = 0; i < 3; i++) await engine.sync(mailbox.id, "poll", true);

			expect(await lastUids()).toEqual([0]);
		});

		test("should scan a renumbered folder again without saving known attachments twice", async () => {
			const mailbox = await createMailbox();
			let uidValidity = 100n;
			let serverMessages = [{ uid: 5, body: "old bill" }];
			const engine = new MailboxEngine(() =>
				client({
					get mailbox() {
						return { uidValidity };
					},
					search: async (criteria: any) =>
						criteria.all
							? serverMessages.map((m) => m.uid)
							: serverMessages
									.map((m) => m.uid)
									.filter((uid) => uid >= Number(criteria.uid.split(":")[0])),
					fetch: async function* (uids: number[]) {
						for (const uid of uids) yield message(uid);
					},
					download: async (uid: number) => ({
						content: [
							Buffer.from(serverMessages.find((m) => m.uid === uid)?.body ?? ""),
						],
					}),
				}),
			);

			await engine.sync(mailbox.id, "manual", true);
			expect(await lastUids()).toEqual([5]);

			// The server recreates the folder: the old bill now has UID 1 and a
			// new bill got UID 2, both below the stored checkpoint.
			uidValidity = 200n;
			serverMessages = [
				{ uid: 1, body: "old bill" },
				{ uid: 2, body: "new bill" },
			];
			// The helper names attachments after the UID; a real bill keeps its
			// file name when the folder is renumbered.
			await db
				.update(downloads)
				.set({ filename: "bill-1-1.pdf" })
				.where(eq(downloads.messageUid, 5));

			await engine.sync(mailbox.id, "manual", true);

			const [checkpoint] = await db.query.checkpoints.findMany();
			expect(checkpoint.lastUid).toBe(2);
			expect(checkpoint.uidValidity).toBe("200");
			expect(await savedParts()).toEqual(["5/1", "2/1"]);
		});

		test("should adopt the folder's UID validity for existing data without rescanning", async () => {
			const mailbox = await createMailbox();
			await db
				.insert(checkpoints)
				.values({ mailboxId: mailbox.id, folder: "INBOX", lastUid: 5 });
			const search = mock(async () => []);
			const engine = new MailboxEngine(() =>
				client({
					mailbox: { uidValidity: 100n },
					search,
					fetch: async function* () {},
				}),
			);
			await engine.sync(mailbox.id, "manual", true);

			const [checkpoint] = await db.query.checkpoints.findMany();
			expect(checkpoint.lastUid).toBe(5);
			expect(checkpoint.uidValidity).toBe("100");
			expect((search.mock.calls[0] as unknown as any[])[0]).toEqual({
				uid: "6:*",
			});
		});

		test("should retry a large attachment that arrives cut short", async () => {
			const mailbox = await createMailbox();
			const encodedSize = 6 * 1024 * 1024;
			const full = Buffer.alloc(Math.floor(encodedSize * 0.73), 1);
			let downloadCalls = 0;
			const engine = new MailboxEngine(() =>
				client({
					search: async () => [5],
					fetch: async function* () {
						const msg = message(5);
						Object.assign(msg.bodyStructure.childNodes[0], {
							encoding: "base64",
							size: encodedSize,
						});
						yield msg;
					},
					download: async () => {
						downloadCalls++;
						// First attempt loses everything after the first chunk
						return {
							content: [
								downloadCalls === 1 ? full.subarray(0, 3 * 1024 * 1024) : full,
							],
						};
					},
				}),
			);
			await engine.sync(mailbox.id, "manual", true);

			expect(downloadCalls).toBe(2);
			const [record] = await db.query.downloads.findMany();
			expect(record.size).toBe(full.length);
			expect(await lastUids()).toEqual([5]);
		}, 15000);
	});
});
