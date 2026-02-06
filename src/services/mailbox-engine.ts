import { rm } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
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
	size: number;
};

type FetchedItem = {
	uid: number;
	envelope: any;
	parts: AttachmentPart[];
};

export class MailboxEngine {
	private activeSyncs = new Map<number, AbortController>();

	constructor(private clientFactory?: (options: ImapFlowOptions) => ImapFlow) {}

	abort(mailboxId: number) {
		const controller = this.activeSyncs.get(mailboxId);
		if (controller) {
			logger.info({ mailboxId }, "Aborting active sync job");
			controller.abort();
			this.activeSyncs.delete(mailboxId);
		}
	}

	abortAll() {
		logger.info(
			{ activeCount: this.activeSyncs.size },
			"Aborting all active sync jobs",
		);
		for (const [_mailboxId, controller] of this.activeSyncs.entries()) {
			controller.abort();
		}
		this.activeSyncs.clear();
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

		const client = this.clientFactory
			? this.clientFactory(clientOptions)
			: new ImapFlow(clientOptions);
		try {
			await client.connect();
		} catch (error: any) {
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

		const maxRetries = 3;
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
					client = this.clientFactory
						? this.clientFactory(clientOptions)
						: new ImapFlow(clientOptions);
					await client.connect();
					connected = true;
				} catch (connErr: any) {
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
					const checkpoint = await db.query.checkpoints.findFirst({
						where: and(
							eq(checkpoints.mailboxId, mailboxId),
							eq(checkpoints.folder, folder),
						),
					});

					const searchCriteria: any = {};
					if (checkpoint?.lastUid) {
						searchCriteria.uid = `${checkpoint.lastUid + 1}:*`;
					} else if (mailbox.syncMode === "everything") {
						searchCriteria.all = true;
					} else {
						// from-now-on mode, no checkpoint yet
						const now = new Date();
						searchCriteria.since = now;
						await db.insert(checkpoints).values({
							mailboxId,
							folder,
							fromNowTimestamp: now.toISOString(),
						});
					}

					if (process.env.DEBUG_SEARCH) {
						logger.debug(
							{ mailboxId, folder, searchCriteria },
							"DEBUG: Search criteria constructed",
						);
					}

					// PHASE 1: fetch only metadata + structure, do NOT download inside this iterator
					const items: FetchedItem[] = [];

					logger.debug(
						{ mailboxId, folder, searchCriteria },
						"Searching for messages",
					);

					let uids = await client.search(searchCriteria, { uid: true });
					if (checkpoint?.lastUid && checkpoint.lastUid > 0) {
						if (uids && Array.isArray(uids)) {
							uids = uids.filter((u: number) => u > checkpoint.lastUid!);
						}
					}

					if (
						!uids ||
						uids.length ===
							0 /*|| (uids.length === 1 && uids[0] < checkpoint.lastUid + 1)*/
					) {
						logger.debug(
							{ mailboxId, folder },
							"No messages found matching criteria",
						);
					} else {
						logger.debug(
							{ mailboxId, folder, count: uids.length },
							"Fetching metadata for found messages",
						);

						// PHASE 1: fetch only metadata + structure, do NOT download inside this iterator
						const fetcher = client.fetch(uids, {
							uid: true,
							envelope: true,
							bodyStructure: true,
						});

						for await (const msg of fetcher) {
							if (signal.aborted) break;
							stats.scannedMessages++;

							const parts = this.findAttachmentParts(msg.bodyStructure);

							logger.debug(
								{
									uid: msg.uid,
									subject: msg.envelope?.subject,
									attachmentCount: parts.length,
								},
								"Queued message for attachment download",
							);

							items.push({
								uid: msg.uid,
								envelope: msg.envelope,
								parts,
							});

							// Update checkpoint per message to be resilient (as your original)
							const currentCheckpoint = await db.query.checkpoints.findFirst({
								where: and(
									eq(checkpoints.mailboxId, mailboxId),
									eq(checkpoints.folder, folder),
								),
							});

							if (currentCheckpoint) {
								await db
									.update(checkpoints)
									.set({
										lastUid: msg.uid,
									})
									.where(eq(checkpoints.id, currentCheckpoint.id));
							} else {
								await db.insert(checkpoints).values({
									mailboxId,
									folder,
									lastUid: msg.uid,
								});
							}
						}
					}

					// If it was an "everything" or "from-now-on" sync but no messages were found,
					// we should still create a checkpoint so next time we use UID
					const finalCheckpoint = await db.query.checkpoints.findFirst({
						where: and(
							eq(checkpoints.mailboxId, mailboxId),
							eq(checkpoints.folder, folder),
						),
					});

					if (!finalCheckpoint?.lastUid && items.length === 0) {
						const mailboxState = await client.status(folder, { uidNext: true });
						if (mailboxState.uidNext) {
							if (finalCheckpoint) {
								await db
									.update(checkpoints)
									.set({
										lastUid: mailboxState.uidNext - 1,
										fromNowTimestamp:
											mailbox.syncMode === "from-now-on"
												? new Date().toISOString()
												: finalCheckpoint.fromNowTimestamp,
									})
									.where(eq(checkpoints.id, finalCheckpoint.id));
							} else {
								await db.insert(checkpoints).values({
									mailboxId,
									folder,
									lastUid: mailboxState.uidNext - 1,
									fromNowTimestamp:
										mailbox.syncMode === "from-now-on"
											? new Date().toISOString()
											: null,
								});
							}
						}
					}

					// PHASE 2: now download parts sequentially (no active fetch iterator)
					for (const item of items) {
						if (signal.aborted) break;
						for (const part of item.parts) {
							if (signal.aborted) break;
							let partAttempt = 0;
							let partSuccess = false;

							while (partAttempt < maxRetries && !partSuccess) {
								try {
									const { content: stream } = await client.download(
										item.uid,
										part.part,
										{
											uid: true,
											chunkSize: 4 * 1024 * 1024,
										},
									);

									const chunks: Buffer[] = [];
									for await (const chunk of stream as any) {
										if (Buffer.isBuffer(chunk)) chunks.push(chunk);
										else {
											chunks.push(Buffer.from(chunk));
										}
									}
									const content = Buffer.concat(chunks);

									const result = await processor.process({
										mailboxId,
										folder,
										messageUid: item.uid,
										messageDate: item.envelope?.date,
										from: item.envelope?.from?.[0]?.address,
										subject: item.envelope?.subject,
										attachmentPartId: part.part,
										filename: part.filename,
										mime: part.mime,
										size: part.size,
										content,
									});

									if (result.saved) {
										stats.savedAttachments++;
										logger.debug(
											{
												mailboxId,
												uid: item.uid,
												part: part.part,
												filename: part.filename,
											},
											"Attachment saved",
										);
									} else if (result.skipped) {
										stats.skipped++;
										logger.debug(
											{
												mailboxId,
												uid: item.uid,
												part: part.part,
												filename: part.filename,
											},
											"Attachment skipped by filters",
										);
									}
									if (result.error) {
										stats.errors++;
										logger.error(
											{
												mailboxId,
												uid: item.uid,
												part: part.part,
												filename: part.filename,
												error: result.error,
											},
											"Attachment processing error",
										);
									}

									partSuccess = true;
								} catch (err: any) {
									partAttempt++;
									if (partAttempt >= maxRetries) {
										logger.error(
											{ err, mailboxId, uid: item.uid, part: part.part },
											"Error downloading attachment after retries",
										);
										stats.errors++;
									} else {
										const delay = 2 ** partAttempt * 500;
										await new Promise((resolve) => setTimeout(resolve, delay));
									}
								}
							}
						}
					}
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

		const client = this.clientFactory
			? this.clientFactory(clientOptions)
			: new ImapFlow(clientOptions);

		try {
			await client.connect();
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
			mailbox.name,
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
	): AttachmentPart[] {
		if (!structure) return parts;

		// ImapFlow sometimes gives:
		//  - type: "multipart", subtype: "mixed"
		//  - OR type: "multipart/mixed" (subtype may be missing)
		//  - OR type: "text", subtype: "plain", etc.
		const rawType = String(structure.type || "").toLowerCase();
		const rawSubtype = String(structure.subtype || "").toLowerCase();

		const isMultipart =
			rawType === "multipart" ||
			rawType.startsWith("multipart/") ||
			(rawType === "multipart" && !!rawSubtype);

		if (isMultipart) {
			if (Array.isArray(structure.childNodes)) {
				for (const child of structure.childNodes) {
					this.findAttachmentParts(child, parts);
				}
			}
			return parts;
		}

		const dispType = String(structure.disposition || "").toLowerCase();
		const filename =
			structure.dispositionParameters?.filename ||
			structure.parameters?.filename ||
			structure.parameters?.name ||
			"";

		const isAttachment = dispType === "attachment" || !!filename;

		if (isAttachment) {
			const partId = String(structure.part || "");
			if (partId) {
				// Build MIME robustly:
				// - if rawType already contains '/', use it as-is (e.g. "multipart/mixed", "application/pdf")
				// - else combine type/subtype
				const mime = rawType.includes("/")
					? rawType
					: `${rawType}/${rawSubtype || "octet-stream"}`;

				parts.push({
					part: partId,
					filename: filename || "unnamed",
					mime,
					size: Number(structure.size) || 0,
				});
			}
		}

		// Defensive recursion for odd structures
		if (Array.isArray(structure.childNodes)) {
			for (const child of structure.childNodes) {
				this.findAttachmentParts(child, parts);
			}
		}

		return parts;
	}
}
