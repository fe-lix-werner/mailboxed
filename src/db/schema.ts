import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	email: text("email").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const mailboxes = sqliteTable("mailboxes", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	userId: integer("user_id")
		.references(() => users.id)
		.notNull(),
	name: text("name").notNull(),
	host: text("host").notNull(),
	port: integer("port").notNull(),
	tlsMode: text("tls_mode", { enum: ["tls", "starttls", "none"] })
		.notNull()
		.default("tls"),
	username: text("username").notNull(),
	passwordEnc: text("password_enc").notNull(), // AES-256-GCM
	basePath: text("base_path").notNull(),
	folderListJson: text("folder_list_json").notNull().default('["INBOX"]'),
	filtersJson: text("filters_json").notNull().default("{}"),
	dedupeMode: text("dedupe_mode").notNull().default("uid-part-hash"),
	syncMode: text("sync_mode", { enum: ["everything", "from-now-on"] })
		.notNull()
		.default("everything"),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	pollIntervalSec: integer("poll_interval_sec").notNull().default(600),
	busyPolicy: text("busy_policy", { enum: ["skip", "queue_one"] })
		.notNull()
		.default("skip"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const checkpoints = sqliteTable(
	"checkpoints",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		mailboxId: integer("mailbox_id")
			.references(() => mailboxes.id)
			.notNull(),
		folder: text("folder").notNull(),
		lastUid: integer("last_uid"),
		fromNowTimestamp: text("from_now_timestamp"),
	},
	(table) => ({
		mailboxFolderIdx: index("mailbox_folder_idx").on(
			table.mailboxId,
			table.folder,
		),
	}),
);

export const jobs = sqliteTable("jobs", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	mailboxId: integer("mailbox_id")
		.references(() => mailboxes.id)
		.notNull(),
	mailboxName: text("mailbox_name"), // Added for redundancy/display
	trigger: text("trigger", { enum: ["poll", "manual"] }).notNull(),
	status: text("status", {
		enum: ["queued", "running", "success", "failed", "cancelled"],
	}).notNull(),
	startedAt: text("started_at"),
	finishedAt: text("finished_at"),
	statsJson: text("stats_json"),
	attachmentCount: integer("attachment_count").default(0), // Added for dashboard
	errorText: text("error_text"),
});

export const downloads = sqliteTable(
	"downloads",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		mailboxId: integer("mailbox_id")
			.references(() => mailboxes.id)
			.notNull(),
		folder: text("folder").notNull(),
		messageUid: integer("message_uid").notNull(),
		messageDate: text("message_date"),
		from: text("from"),
		subject: text("subject"),
		attachmentPartId: text("attachment_part_id").notNull(),
		filename: text("filename").notNull(),
		mime: text("mime").notNull(),
		size: integer("size").notNull(),
		sha256: text("sha256").notNull(),
		path: text("path").notNull(),
		downloadedAt: text("downloaded_at")
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		jobId: integer("job_id").references(() => jobs.id),
	},
	(table) => ({
		dedupeIdx: index("dedupe_idx").on(
			table.mailboxId,
			table.folder,
			table.messageUid,
			table.attachmentPartId,
		),
		hashIdx: index("hash_idx").on(table.sha256),
	}),
);
