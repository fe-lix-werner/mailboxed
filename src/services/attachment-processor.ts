import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db } from "../db";
import { downloads } from "../db/schema";
import type { MailboxFilter } from "../types";
import { logger } from "./logger";

export interface AttachmentInfo {
	mailboxId: number;
	folder: string;
	messageUid: number;
	/** UIDVALIDITY of the folder the UID belongs to, if the server reported one. */
	uidValidity?: string | null;
	messageDate?: Date;
	from?: string;
	subject?: string;
	attachmentPartId: string;
	filename: string;
	mime: string;
	size: number;
	content: Buffer;
}

export type ProcessResult = {
	saved: boolean;
	skipped: boolean;
	/** Why the attachment was not saved; lets the caller report skips instead of dropping them silently. */
	reason?: string;
	error?: string;
};

export class AttachmentProcessor {
	constructor(
		private mailboxId: number,
		private mailboxName: string,
		private basePath: string,
		private filters: MailboxFilter,
		private jobId?: number,
	) {}

	async process(info: AttachmentInfo): Promise<ProcessResult> {
		try {
			// 1. Filter
			const filterReason = this.filterRejection(info);
			if (filterReason) {
				return { saved: false, skipped: true, reason: filterReason };
			}

			// 2. Dedupe (Basic check by UID/Part)
			const existing = await db.query.downloads.findFirst({
				where: and(
					eq(downloads.mailboxId, this.mailboxId),
					eq(downloads.folder, info.folder),
					eq(downloads.messageUid, info.messageUid),
					eq(downloads.attachmentPartId, info.attachmentPartId),
					// The same UID means a different message once the folder was renumbered
					info.uidValidity
						? or(
								isNull(downloads.uidValidity),
								eq(downloads.uidValidity, info.uidValidity),
							)
						: undefined,
				),
			});

			if (existing) {
				return { saved: false, skipped: true, reason: "already downloaded" };
			}

			// 3. Hash
			const hash = createHash("sha256").update(info.content).digest("hex");

			// After a renumbering the folder is scanned again and UIDs no longer
			// identify what was saved before; the content does.
			if (info.uidValidity) {
				const savedBefore = await db.query.downloads.findFirst({
					where: and(
						eq(downloads.mailboxId, this.mailboxId),
						eq(downloads.folder, info.folder),
						eq(downloads.sha256, hash),
						eq(downloads.filename, info.filename),
						isNotNull(downloads.uidValidity),
						ne(downloads.uidValidity, info.uidValidity),
					),
				});
				if (savedBefore) {
					return {
						saved: false,
						skipped: true,
						reason: "already downloaded before the folder was renumbered",
					};
				}
			}

			// 4. Determine path
			const downloadRoot = process.env.DOWNLOAD_ROOT || "downloads";
			const tmpRoot = process.env.TMP_DIR || join(downloadRoot, ".tmp");

			const fullDir = join(
				downloadRoot,
				this.basePath,
			);

			await mkdir(fullDir, { recursive: true });
			await mkdir(tmpRoot, { recursive: true });

			const safeName = this.generateSafeFilename(info);
			const targetPath = await this.findFreeTargetPath(fullDir, safeName, hash);
			const tmpPath = join(tmpRoot, `${randomBytes(16).toString("hex")}-${safeName}`);

			// 5. Save to temp file first
			await writeFile(tmpPath, info.content);

			try {
				// 6. Move to target path
				try {
					await rename(tmpPath, targetPath);
				} catch (moveError: any) {
					logger.error({ moveError, tmpPath, targetPath }, "Failed to move file from temp to target");
					throw moveError;
				}

				// 7. Record in DB
				await db.insert(downloads).values({
					mailboxId: this.mailboxId,
					folder: info.folder,
					messageUid: info.messageUid,
					uidValidity: info.uidValidity,
					messageDate: info.messageDate?.toISOString(),
					from: info.from,
					subject: info.subject,
					attachmentPartId: info.attachmentPartId,
					filename: info.filename,
					mime: info.mime,
					size: info.size,
					sha256: hash,
					path: targetPath,
					jobId: this.jobId,
				});
			} finally {
				// Cleanup temp file if it still exists (e.g. if move failed or DB insert failed)
				try {
					await rm(tmpPath, { force: true });
				} catch (_err) {
					// Ignore cleanup errors
				}
			}

			return { saved: true, skipped: false };
		} catch (error: any) {
			logger.error({ error, info }, "Failed to process attachment");
			return { saved: false, skipped: false, error: error.message };
		}
	}

	/**
	 * Generated names are not unique: sanitizing and truncating can map different
	 * attachments to the same name, and UIDs repeat across folders. A name is only
	 * reused when the file already there has the same content.
	 */
	private async findFreeTargetPath(
		dir: string,
		safeName: string,
		hash: string,
	): Promise<string> {
		const ext = extname(safeName);
		const base = safeName.slice(0, safeName.length - ext.length);

		for (let n = 1; ; n++) {
			const candidate = join(dir, n === 1 ? safeName : `${base}-${n}${ext}`);
			let existing: Buffer;
			try {
				existing = await readFile(candidate);
			} catch (err: any) {
				if (err.code === "ENOENT") return candidate;
				throw err;
			}
			if (createHash("sha256").update(existing).digest("hex") === hash) {
				return candidate;
			}
		}
	}

	private generateSafeFilename(info: AttachmentInfo): string {
		const sanitize = (s: string | undefined, max: number) => {
			if (!s) return "unknown";
			return s
				.replace(/[^a-z0-9]/gi, "_")
				.replace(/_+/g, "_")
				.substring(0, max)
				.replace(/^_|_$/g, "");
		};

		const sender = sanitize(info.from?.split("@")[0], 30);
		const subject = sanitize(info.subject, 50);

		const lastDotIndex = info.filename.lastIndexOf(".");
		const baseName =
			lastDotIndex === -1
				? info.filename
				: info.filename.substring(0, lastDotIndex);
		const ext =
			lastDotIndex === -1 ? "" : info.filename.substring(lastDotIndex); // includes the dot

		const filename = sanitize(baseName, 50);
		const mailboxId = this.mailboxId.toString();
		const messageId = info.messageUid.toString();

		// <sender>-<subject>-<filename>-<mailbox-id>-<message-id>.<file-ext>
		return `${sender}-${subject}-${filename}-${mailboxId}-${messageId}${ext}`;
	}

	/** Returns why the configured filters reject the attachment, or null if it passes. */
	private filterRejection(info: AttachmentInfo): string | null {
		const ext = info.filename.split(".").pop()?.toLowerCase();

		if (this.filters.extensions?.length) {
			if (!ext || !this.filters.extensions.includes(ext)) {
				return `extension "${ext ?? ""}" not in allowed extensions`;
			}
		}

		if (this.filters.mimes?.length) {
			const matches = this.filters.mimes.some((m) => {
				// Relaxed handling: if extension matches a known MIME type, allow it
				if (m === "application/pdf" && ext === "pdf") return true;
				if (m === "image/jpeg" && (ext === "jpg" || ext === "jpeg"))
					return true;
				if (m === "image/png" && ext === "png") return true;
				if (m === "image/gif" && ext === "gif") return true;

				if (m.endsWith("/*")) {
					const prefix = m.replace("/*", "");
					return info.mime.startsWith(prefix);
				}
				return info.mime === m;
			});
			if (!matches) return `type "${info.mime}" not in allowed types`;
		}
		if (this.filters.minSize && info.size < this.filters.minSize) {
			return `size ${info.size} below minimum ${this.filters.minSize}`;
		}
		if (this.filters.maxSize && info.size > this.filters.maxSize) {
			return `size ${info.size} above maximum ${this.filters.maxSize}`;
		}

		return null;
	}
}
