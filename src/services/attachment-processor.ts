import { createHash, randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { downloads } from "../db/schema";
import type { MailboxFilter } from "../types";
import { logger } from "./logger";

export interface AttachmentInfo {
	mailboxId: number;
	folder: string;
	messageUid: number;
	messageDate?: Date;
	from?: string;
	subject?: string;
	attachmentPartId: string;
	filename: string;
	mime: string;
	size: number;
	content: Buffer;
}

export class AttachmentProcessor {
	constructor(
		private mailboxId: number,
		private mailboxName: string,
		private basePath: string,
		private filters: MailboxFilter,
		private jobId?: number,
	) {}

	async process(
		info: AttachmentInfo,
	): Promise<{ saved: boolean; skipped: boolean; error?: string }> {
		try {
			// 1. Filter
			if (!this.matchesFilters(info)) {
				return { saved: false, skipped: true };
			}

			// 2. Dedupe (Basic check by UID/Part)
			const existing = await db.query.downloads.findFirst({
				where: and(
					eq(downloads.mailboxId, this.mailboxId),
					eq(downloads.folder, info.folder),
					eq(downloads.messageUid, info.messageUid),
					eq(downloads.attachmentPartId, info.attachmentPartId),
				),
			});

			if (existing) {
				return { saved: false, skipped: true };
			}

			// 3. Hash
			const hash = createHash("sha256").update(info.content).digest("hex");

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
			const targetPath = join(fullDir, safeName);
			const tmpPath = join(tmpRoot, `${randomBytes(16).toString("hex")}-${safeName}`);

			// 5. Save to temp file first
			await writeFile(tmpPath, info.content);

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

			return { saved: true, skipped: false };
		} catch (error: any) {
			logger.error({ error, info }, "Failed to process attachment");
			return { saved: false, skipped: false, error: error.message };
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

	private matchesFilters(info: AttachmentInfo): boolean {
		const ext = info.filename.split(".").pop()?.toLowerCase();

		if (this.filters.extensions?.length) {
			if (!ext || !this.filters.extensions.includes(ext)) return false;
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
			if (!matches) return false;
		}
		if (this.filters.minSize && info.size < this.filters.minSize) return false;
		if (this.filters.maxSize && info.size > this.filters.maxSize) return false;

		return true;
	}
}
