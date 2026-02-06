CREATE TABLE `checkpoints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mailbox_id` integer NOT NULL,
	`folder` text NOT NULL,
	`last_uid` integer,
	`from_now_timestamp` text,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mailbox_folder_idx` ON `checkpoints` (`mailbox_id`,`folder`);--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mailbox_id` integer NOT NULL,
	`folder` text NOT NULL,
	`message_uid` integer NOT NULL,
	`message_date` text,
	`from` text,
	`subject` text,
	`attachment_part_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`path` text NOT NULL,
	`downloaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`job_id` integer,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dedupe_idx` ON `downloads` (`mailbox_id`,`folder`,`message_uid`,`attachment_part_id`);--> statement-breakpoint
CREATE INDEX `hash_idx` ON `downloads` (`sha256`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mailbox_id` integer NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`stats_json` text,
	`error_text` text,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mailboxes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`tls_mode` text DEFAULT 'tls' NOT NULL,
	`username` text NOT NULL,
	`password_enc` text NOT NULL,
	`base_path` text NOT NULL,
	`folder_list_json` text DEFAULT '["INBOX"]' NOT NULL,
	`filters_json` text DEFAULT '{}' NOT NULL,
	`dedupe_mode` text DEFAULT 'uid-part-hash' NOT NULL,
	`sync_mode` text DEFAULT 'everything' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`poll_interval_sec` integer DEFAULT 600 NOT NULL,
	`busy_policy` text DEFAULT 'skip' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);