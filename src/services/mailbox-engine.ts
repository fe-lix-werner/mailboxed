import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { ImapFlow, type ImapFlowOptions } from "imapflow";
import { db } from "../db";
import { checkpoints, downloads, jobs, mailboxes } from "../db/schema";
import type { MailboxFilter, SyncStats } from "../types";
import { AttachmentProcessor } from "./attachment-processor";
import { logger } from "./logger";
import { decrypt } from "./security";

type AttachmentPart = {
	part: string;
	filename: string;
	mime: string;
	/** Size of the part as stored on the server, i.e. still transfer-encoded. */
	size: number;
	encoding?: string;
};

type FolderSync = {
	client: ImapFlow;
	mailbox: typeof mailboxes.$inferSelect;
	folder: string;
	processor: AttachmentProcessor;
	signal: AbortSignal;
	stats: SyncStats;
};

const MAX_RETRIES = 3;
const DOWNLOAD_CHUNK_SIZE = 4 * 1024 * 1024;

type FetchedItem = {
	uid: number;
	envelope: any;
	parts: AttachmentPart[];
};

export class MailboxEngine {
	private activeSyncs = new Map<number, AbortController>();

	constructor(private clientFactory?: (options: ImapFlowOptions) => ImapFlow) {}

	async abort(mailboxId: number) {
		const controller = this.activeSyncs.get(mailboxId);
		if (controller) {
			logger.info({ mailboxId }, "Aborting active sync job");
			controller.abort();
			this.activeSyncs.delete(mailboxId);

			// Update database status
			try {
				await db
					.update(jobs)
					.set({
						status: "cancelled",
						finishedAt: new Date().toISOString(),
						errorText: "Aborted by user",
					})
					.where(
						and(
							eq(jobs.mailboxId, mailboxId),
							inArray(jobs.status, ["queued", "running"]),
						),
					);
			} catch (err) {
				logger.error(
					{ mailboxId, err },
					"Failed to update job status after abort",
				);
			}
		}
	}

	async abortAll() {
		logger.info(
			{ activeCount: this.activeSyncs.size },
			"Aborting all active sync jobs",
		);
		for (const [mailboxId, controller] of this.activeSyncs.entries()) {
			controller.abort();

			// Update database status
			try {
				await db
					.update(jobs)
					.set({
						status: "cancelled",
						finishedAt: new Date().toISOString(),
						errorText: "Aborted by system shutdown",
					})
					.where(
						and(
							eq(jobs.mailboxId, mailboxId),
							inArray(jobs.status, ["queued", "running"]),
						),
					);
			} catch (err) {
				logger.error(
					{ mailboxId, err },
					"Failed to update job status after abortAll",
				);
			}
		}
		this.activeSyncs.clear();
	}

	private createClient(options: ImapFlowOptions): ImapFlow {
		const client = this.clientFactory
			? this.clientFactory(options)
			: new ImapFlow(options);

		// ImapFlow reports a lost connection as an 'error' event, which is fatal
		// to the process when nobody listens. The running command rejects as well,
		// so that is where the failure is handled.
		if (typeof client.on === "function") {
			client.on("error", (err: any) => {
				logger.warn({ err: err?.message, code: err?.code }, "IMAP connection error");
			});
		}
		return client;
	}

	/**
	 * Tears down a client whose connect() failed. ImapFlow removes its own socket
	 * listeners before destroying the socket, and aborting a TLS handshake that
	 * way raises one more socket error that would otherwise be unhandled.
	 */
	private discardClient(client: ImapFlow) {
		const socket = (client as any).socket;
		if (socket && typeof socket.on === "function") {
			socket.on("error", () => {});
		}
		if (typeof client.close === "function") {
			try {
				client.close();
			} catch (_closeErr) {
				// already closed
			}
		}
	}

	async testConnection(config: any) {
		const clientOptions: ImapFlowOptions = {
			host: config.host,
			port: config.port,
			secure: config.tlsMode === "tls",
			auth: {
				user: config.username,
				pass: config.password,
			},
			logger: false,
			connectionTimeout: 10000,
		};

		const client = this.createClient(clientOptions);
		try {
			await client.connect();
		} catch (error: any) {
			this.discardClient(client);
			return { success: false, error: error.message };
		}

		try {
			await client.logout();
		} catch (_logoutErr) {
			// ignore logout errors
		}
		return { success: true };
	}

	async sync(
		mailboxId: number,
		trigger: "poll" | "manual" = "poll",
		force: boolean = false,
	) {
		if (process.env.NODE_ENV === "test" && !force) {
			logger.debug({ mailboxId, trigger }, "Sync skipped in test environment");
			return;
		}

		const mailbox = await db.query.mailboxes.findFirst({
			where: eq(mailboxes.id, mailboxId),
		});

		if (!mailbox || !mailbox.enabled) return;

		// Concurrency guard: do not start a new sync when one is already running
		const runningJob = await db.query.jobs.findFirst({
			where: and(eq(jobs.mailboxId, mailboxId), eq(jobs.status, "running")),
		});

		if (runningJob) {
			if (mailbox.busyPolicy === "queue_one") {
				// Only create a single queued job if none exists yet
				const queuedJob = await db.query.jobs.findFirst({
					where: and(eq(jobs.mailboxId, mailboxId), eq(jobs.status, "queued")),
				});
				if (!queuedJob) {
					await db.insert(jobs).values({
						mailboxId,
						mailboxName: mailbox.name,
						trigger,
						status: "queued",
					});
					logger.info(
						{ mailboxId, trigger },
						"Sync queued because a previous sync is still running",
					);
				} else {
					logger.info(
						{ mailboxId, trigger },
						"Sync already queued; keeping single queued job while running",
					);
				}
			} else {
				// Default/skip policy
				logger.info(
					{ mailboxId, trigger },
					"Sync skipped because a previous sync is still running",
				);
			}
			return;
		}

		const [job] = await db
			.insert(jobs)
			.values({
				mailboxId,
				mailboxName: mailbox.name,
				trigger,
				status: "running",
				startedAt: new Date().toISOString(),
			})
			.returning();

		const controller = new AbortController();
		this.activeSyncs.set(mailboxId, controller);
		const { signal } = controller;

		const stats: SyncStats = {
			scannedMessages: 0,
			savedAttachments: 0,
			skipped: 0,
			errors: 0,
		};

		const maxRetries = MAX_RETRIES;
		let attempt = 0;
		let connected = false;

		const clientOptions: ImapFlowOptions = {
			host: mailbox.host,
			port: mailbox.port,
			secure: mailbox.tlsMode === "tls",
			auth: {
				user: mailbox.username,
				pass: await decrypt(mailbox.passwordEnc),
			},
			logger: false,
			// strongly reduces IMAP state issues while doing fetch/download sequences
			disableAutoIdle: true,
		};

		let client: ImapFlow | undefined;
		try {
			while (attempt < maxRetries && !connected) {
				try {
					client = this.createClient(clientOptions);
					await client.connect();
					connected = true;
				} catch (connErr: any) {
					if (client) this.discardClient(client);
					attempt++;
					if (attempt >= maxRetries) throw connErr;
					const delay = 2 ** attempt * 1000;
					logger.warn(
						{ mailboxId, attempt, delay },
						"Connection failed, retrying...",
					);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}

			if (!client) {
				throw new Error("Failed to initialize IMAP client");
			}

			const folders = JSON.parse(mailbox.folderListJson) as string[];
			const filters = JSON.parse(mailbox.filtersJson) as MailboxFilter;

			const processor = new AttachmentProcessor(
				mailbox.id,
				mailbox.name,
				mailbox.basePath,
				filters,
				job?.id,
			);

			for (const folder of folders) {
				if (signal.aborted) break;
				const lock = await client.getMailboxLock(folder);
				try {
					await this.syncFolder({
						client,
						mailbox,
						folder,
						processor,
						signal,
						stats,
					});
				} finally {
					lock.release();
				}
			}

			if (signal.aborted) {
				throw new Error("Sync cancelled");
			}

			await db
				.update(jobs)
				.set({
					status: "success",
					finishedAt: new Date().toISOString(),
					statsJson: JSON.stringify(stats),
					attachmentCount: stats.savedAttachments,
				})
				.where(eq(jobs.id, job?.id || -1));

			await this.pruneJobs();
		} catch (error: any) {
			logger.error(
				{
					err: error,
					mailboxId,
					message: error.message,
					stack: error.stack,
				},
				"Mailbox sync failed",
			);

			await db
				.update(jobs)
				.set({
					status: error.message === "Sync cancelled" ? "cancelled" : "failed",
					finishedAt: new Date().toISOString(),
					errorText: error.message,
					statsJson: JSON.stringify(stats),
					attachmentCount: stats.savedAttachments,
				})
				.where(eq(jobs.id, job?.id || -1));

			await this.pruneJobs();
		} finally {
			this.activeSyncs.delete(mailboxId);
			if (client) {
				try {
					await client.logout();
				} catch (_logoutErr) {
					// ignore logout errors if connection was already dead
				}
			}
		}
	}

	/**
	 * Syncs one folder; the caller holds the mailbox lock.
	 *
	 * Progress is a single UID per folder, so the checkpoint may only move to a
	 * UID when every message up to it has been handled completely. Anything that
	 * leaves a message unfinished stops the checkpoint right before it.
	 */
	private async syncFolder(ctx: FolderSync) {
		const { client, mailbox, folder, signal, stats } = ctx;
		const mailboxId = mailbox.id;

		const rawValidity = (client as any).mailbox?.uidValidity;
		const uidValidity = rawValidity != null ? String(rawValidity) : null;
		const checkpoint = await this.loadCheckpoint(mailboxId, folder, uidValidity);
		const lastUid = checkpoint.lastUid;

		const searchCriteria: any = {};
		if (lastUid != null) {
			searchCriteria.uid = `${lastUid + 1}:*`;
		} else if (mailbox.syncMode === "everything") {
			searchCriteria.all = true;
		} else {
			// The start of a from-now-on sync is remembered, so that a first run
			// which fails does not shift the window and drop mail from before the retry.
			let since = checkpoint.fromNowTimestamp;
			if (!since) {
				since = new Date().toISOString();
				await db
					.update(checkpoints)
					.set({ fromNowTimestamp: since })
					.where(eq(checkpoints.id, checkpoint.id));
			}
			searchCriteria.since = new Date(since);
		}

		logger.debug(
			{ mailboxId, folder, searchCriteria },
			"Searching for messages",
		);

		const found = await client.search(searchCriteria, { uid: true });
		// ImapFlow reports a failed search as `false`. Treating that as "no
		// messages" would let the checkpoint skip everything in the folder.
		if (!Array.isArray(found)) {
			throw new Error(`Search failed in folder "${folder}"`);
		}
		// "N:*" always matches the newest message, even if its UID is below N
		const uids =
			lastUid != null ? found.filter((u: number) => u > lastUid) : found;

		// PHASE 1: fetch only metadata + structure, do NOT download inside this iterator
		const items: FetchedItem[] = [];
		if (uids.length > 0) {
			logger.debug(
				{ mailboxId, folder, count: uids.length },
				"Fetching metadata for found messages",
			);

			const fetcher = client.fetch(
				uids,
				{ uid: true, envelope: true, bodyStructure: true },
				{ uid: true },
			);

			for await (const msg of fetcher) {
				if (signal.aborted) break;
				stats.scannedMessages++;
				items.push({
					uid: msg.uid,
					envelope: msg.envelope,
					parts: this.findAttachmentParts(msg.bodyStructure),
				});
			}
		}
		if (signal.aborted) return;

		// Servers usually answer in ascending UID order, but nothing guarantees it
		items.sort((a, b) => a.uid - b.uid);

		const fetched = new Set(items.map((item) => item.uid));
		const missing = uids
			.filter((u: number) => !fetched.has(u))
			.sort((a: number, b: number) => a - b);
		const firstMissing: number | undefined = missing[0];
		if (firstMissing !== undefined) {
			logger.warn(
				{ mailboxId, folder, missing: missing.length, firstMissing },
				"Server returned no data for some found messages; they are retried on the next sync",
			);
		}

		// PHASE 2: now download parts sequentially (no active fetch iterator)
		let highWaterMark: number | null = null;
		for (const item of items) {
			if (signal.aborted) break;
			if (firstMissing !== undefined && item.uid > firstMissing) break;
			const complete = await this.downloadItem(ctx, item, uidValidity);
			if (!complete) break;
			highWaterMark = item.uid;
		}

		if (highWaterMark !== null) {
			await db
				.update(checkpoints)
				.set({ lastUid: highWaterMark })
				.where(eq(checkpoints.id, checkpoint.id));
		} else if (lastUid == null && uids.length === 0 && !signal.aborted) {
			// Nothing to download yet: remember where the folder currently ends,
			// so later syncs can resume by UID.
			const mailboxState = await client.status(folder, { uidNext: true });
			if (mailboxState.uidNext) {
				await db
					.update(checkpoints)
					.set({ lastUid: mailboxState.uidNext - 1 })
					.where(eq(checkpoints.id, checkpoint.id));
			}
		}
	}

	/**
	 * Returns the folder's checkpoint, creating it on first use.
	 *
	 * UIDs are only stable while the folder keeps its UIDVALIDITY. When the
	 * server assigns a new one (folder recreated, mailbox migrated), the stored
	 * UID says nothing about the renumbered messages and the folder is scanned
	 * again; attachments saved earlier are then recognised by their content.
	 */
	private async loadCheckpoint(
		mailboxId: number,
		folder: string,
		uidValidity: string | null,
	) {
		const existing = await db.query.checkpoints.findFirst({
			where: and(
				eq(checkpoints.mailboxId, mailboxId),
				eq(checkpoints.folder, folder),
			),
			orderBy: [asc(checkpoints.id)],
		});

		if (!existing) {
			const [created] = await db
				.insert(checkpoints)
				.values({ mailboxId, folder, uidValidity })
				.returning();
			return created;
		}

		if (!uidValidity || existing.uidValidity === uidValidity) return existing;

		if (existing.uidValidity == null) {
			// Checkpoint from before UIDVALIDITY was tracked: everything recorded
			// so far belongs to the folder as it is now.
			await db
				.update(downloads)
				.set({ uidValidity })
				.where(
					and(
						eq(downloads.mailboxId, mailboxId),
						eq(downloads.folder, folder),
						isNull(downloads.uidValidity),
					),
				);
			const [adopted] = await db
				.update(checkpoints)
				.set({ uidValidity })
				.where(eq(checkpoints.id, existing.id))
				.returning();
			return adopted;
		}

		logger.warn(
			{
				mailboxId,
				folder,
				previous: existing.uidValidity,
				current: uidValidity,
			},
			"Folder was renumbered by the server (UIDVALIDITY changed); scanning it again",
		);
		const [reset] = await db
			.update(checkpoints)
			.set({ uidValidity, lastUid: null })
			.where(eq(checkpoints.id, existing.id))
			.returning();
		return reset;
	}

	/**
	 * Downloads and stores all attachments of one message.
	 * Returns false when the message was not handled completely.
	 */
	private async downloadItem(
		ctx: FolderSync,
		item: FetchedItem,
		uidValidity: string | null,
	): Promise<boolean> {
		const { client, mailbox, folder, processor, signal, stats } = ctx;
		const mailboxId = mailbox.id;

		for (const part of item.parts) {
			// An aborted message counts as unfinished, otherwise its remaining
			// attachments would never be fetched.
			if (signal.aborted) return false;

			let attempt = 0;
			let done = false;
			while (!done) {
				try {
					const { content: stream } = await client.download(
						item.uid,
						part.part,
						{ uid: true, chunkSize: DOWNLOAD_CHUNK_SIZE },
					);

					const chunks: Buffer[] = [];
					for await (const chunk of stream as any) {
						chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
					}
					const content = Buffer.concat(chunks);

					if (this.isIncomplete(part, content.length)) {
						throw new Error(
							`Incomplete download: got ${content.length} bytes for an encoded part of ${part.size} bytes`,
						);
					}

					const result = await processor.process({
						mailboxId,
						folder,
						messageUid: item.uid,
						uidValidity,
						messageDate: item.envelope?.date,
						from: item.envelope?.from?.[0]?.address,
						subject: item.envelope?.subject,
						attachmentPartId: part.part,
						filename: part.filename,
						mime: part.mime,
						// The size IMAP reports is that of the encoded part,
						// roughly a third larger than the file for base64.
						size: content.length,
						content,
					});

					const logContext = {
						mailboxId,
						folder,
						uid: item.uid,
						part: part.part,
						filename: part.filename,
					};

					if (result.error) {
						stats.errors++;
						logger.error(
							{ ...logContext, error: result.error },
							"Attachment processing error",
						);
						return false;
					}

					if (result.saved) {
						stats.savedAttachments++;
						logger.debug(logContext, "Attachment saved");
					} else if (result.skipped) {
						stats.skipped++;
						// A filtered attachment is never looked at again once the
						// checkpoint has moved on, so it has to be visible at the default log level.
						const log = result.reason?.startsWith("already downloaded")
							? logger.debug.bind(logger)
							: logger.info.bind(logger);
						log(
							{
								...logContext,
								subject: item.envelope?.subject,
								reason: result.reason,
							},
							"Attachment skipped",
						);
					}
					done = true;
				} catch (err: any) {
					attempt++;
					if (attempt >= MAX_RETRIES) {
						logger.error(
							{ err, mailboxId, uid: item.uid, part: part.part },
							"Error downloading attachment after retries",
						);
						stats.errors++;
						return false;
					}
					await new Promise((resolve) =>
						setTimeout(resolve, 2 ** attempt * 500),
					);
				}
			}
		}
		return true;
	}

	/**
	 * ImapFlow ends the stream without an error when a follow-up chunk comes
	 * back empty, so only parts larger than one chunk can be cut short. Base64
	 * decodes to about 73% of its encoded size; clearly less means the tail is
	 * missing. Other encodings are not checked because decoding may
	 * legitimately change their length.
	 */
	private isIncomplete(part: AttachmentPart, received: number): boolean {
		return (
			part.encoding === "base64" &&
			part.size > DOWNLOAD_CHUNK_SIZE &&
			received < part.size * 0.7
		);
	}

	async cleanupIncompleteJobs() {
		try {
			// Find all 'queued' or 'running' jobs to mark them as cancelled
			const result = await db
				.update(jobs)
				.set({
					status: "cancelled",
					finishedAt: new Date().toISOString(),
					errorText: "Backend restarted or job aborted",
				})
				.where(inArray(jobs.status, ["queued", "running"]))
				.returning();

			if (result.length > 0) {
				logger.info(
					{ cancelledCount: result.length },
					"Cleaned up unfinished jobs",
				);
			}
		} catch (err) {
			logger.error({ err }, "Failed to cleanup unfinished jobs");
		}
	}

	async pruneJobs() {
		try {
			const allJobs = await db.query.jobs.findMany({
				orderBy: [desc(jobs.id)],
			});

			if (allJobs.length > 1000) {
				const toDelete = allJobs.slice(1000);
				const idsToDelete = toDelete.map((j) => j.id);

				// sqlite might have limits on the number of parameters, but 1000ish should be fine
				// for safety we can do it in a loop or chunks if needed, but for now:
				await db.delete(jobs).where(inArray(jobs.id, idsToDelete));
				logger.info({ deletedCount: idsToDelete.length }, "Pruned old jobs");
			}
		} catch (err) {
			logger.error({ err }, "Failed to prune jobs");
		}
	}

	async fetchAttachment(
		mailboxId: number,
		folder: string,
		messageUid: number,
		partId: string,
	): Promise<Buffer> {
		const mailbox = await db.query.mailboxes.findFirst({
			where: eq(mailboxes.id, mailboxId),
		});

		if (!mailbox) throw new Error("Mailbox not found");

		const clientOptions: ImapFlowOptions = {
			host: mailbox.host,
			port: mailbox.port,
			secure: mailbox.tlsMode === "tls",
			auth: {
				user: mailbox.username,
				pass: await decrypt(mailbox.passwordEnc),
			},
			logger: false,
			disableAutoIdle: true,
		};

		const client = this.createClient(clientOptions);

		try {
			try {
				await client.connect();
			} catch (connErr) {
				this.discardClient(client);
				throw connErr;
			}
			const lock = await client.getMailboxLock(folder);
			try {
				const { content } = await client.download(String(messageUid), partId, {
					uid: true,
				});
				const chunks: Buffer[] = [];
				for await (const chunk of content) {
					chunks.push(chunk);
				}
				return Buffer.concat(chunks);
			} finally {
				lock.release();
			}
		} finally {
			try {
				await client.logout();
			} catch (_logoutErr) {
				// ignore
			}
		}
	}

	async reset(mailboxId: number) {
		const mailbox = await db.query.mailboxes.findFirst({
			where: eq(mailboxes.id, mailboxId),
		});

		if (!mailbox) throw new Error("Mailbox not found");

		logger.info(
			{ mailboxId },
			"Resetting mailbox: stopping jobs, deleting checkpoints, downloads, and files",
		);

		// 1. Abort any running sync
		this.abort(mailboxId);

		// 2. Update database: set unfinished jobs to cancelled, delete checkpoints and downloads
		await db.transaction(async (tx) => {
			// Set all 'queued' or 'running' jobs for this mailbox to 'cancelled'
			await tx
				.update(jobs)
				.set({
					status: "cancelled",
					finishedAt: new Date().toISOString(),
					errorText: "Mailbox reset",
				})
				.where(
					and(
						eq(jobs.mailboxId, mailboxId),
						inArray(jobs.status, ["queued", "running"]),
					),
				);

			await tx.delete(checkpoints).where(eq(checkpoints.mailboxId, mailboxId));
			await tx.delete(downloads).where(eq(downloads.mailboxId, mailboxId));
		});

		// 3. Also clear files from disk under the same path used by AttachmentProcessor
		const fullDir = join(
			process.env.DOWNLOAD_ROOT || "downloads",
			mailbox.basePath,
		);
		try {
			await rm(fullDir, { recursive: true, force: true });
		} catch (err) {
			// Best-effort removal; log and continue
			logger.warn(
				{ err, mailboxId, fullDir },
				"Failed to remove mailbox download directory",
			);
		}
	}

	findAttachmentParts(
		structure: any,
		parts: AttachmentPart[] = [],
		isRoot = true,
	): AttachmentPart[] {
		if (!structure) return parts;

		// ImapFlow sometimes gives:
		//  - type: "multipart", subtype: "mixed"
		//  - OR type: "multipart/mixed" (subtype may be missing)
		//  - OR type: "text", subtype: "plain", etc.
		const rawType = String(structure.type || "").toLowerCase();
		const rawSubtype = String(structure.subtype || "").toLowerCase();

		const isMultipart =
			rawType === "multipart" || rawType.startsWith("multipart/");

		if (isMultipart) {
			if (Array.isArray(structure.childNodes)) {
				for (const child of structure.childNodes) {
					this.findAttachmentParts(child, parts, false);
				}
			}
			return parts;
		}

		// - if rawType already contains '/', use it as-is (e.g. "application/pdf")
		// - else combine type/subtype
		const mime = rawType.includes("/")
			? rawType
			: `${rawType}/${rawSubtype || "octet-stream"}`;

		const dispType = String(structure.disposition || "").toLowerCase();
		const filename =
			structure.dispositionParameters?.filename ||
			structure.parameters?.filename ||
			structure.parameters?.name ||
			"";

		// Some senders attach documents without a filename or disposition. Body
		// text and inline images look the same, so only application/* parts are
		// taken on type alone, minus the signature parts mail clients add.
		const isUnnamedDocument =
			mime.startsWith("application/") && !/signature|encrypted/.test(mime);

		const isAttachment =
			dispType === "attachment" || !!filename || isUnnamedDocument;

		if (isAttachment) {
			// A message that consists of a single part has no part number in the
			// body structure; IMAP addresses that body as part 1.
			const partId = String(structure.part || (isRoot ? "1" : ""));
			if (partId) {
				parts.push({
					part: partId,
					// Extension filters work on the name, so a nameless PDF still needs one
					filename:
						filename || (mime === "application/pdf" ? "unnamed.pdf" : "unnamed"),
					mime,
					size: Number(structure.size) || 0,
					encoding: structure.encoding
						? String(structure.encoding).toLowerCase()
						: undefined,
				});
			}
		}

		// Defensive recursion for odd structures
		if (Array.isArray(structure.childNodes)) {
			for (const child of structure.childNodes) {
				this.findAttachmentParts(child, parts, false);
			}
		}

		return parts;
	}

	async cleanupTempDir() {
		const downloadRoot = process.env.DOWNLOAD_ROOT || "downloads";
		const tmpRoot = process.env.TMP_DIR || join(downloadRoot, ".tmp");

		try {
			const files = await readdir(tmpRoot);
			const now = Date.now();
			const threshold = 23 * 60 * 60 * 1000; // 23 hours in ms

			for (const file of files) {
				const filePath = join(tmpRoot, file);
				try {
					const s = await stat(filePath);
					if (s.isFile() && now - s.mtimeMs > threshold) {
						await rm(filePath, { force: true });
						logger.info({ filePath }, "Cleaned up old temp file");
					}
				} catch (statErr) {
					// File might have been moved/deleted already
				}
			}
		} catch (err: any) {
			if (err.code !== "ENOENT") {
				logger.error({ err }, "Failed to cleanup temp directory");
			}
		}
	}
}
