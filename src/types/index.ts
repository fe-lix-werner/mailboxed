import { z } from "zod";

export const MailboxFilterSchema = z.object({
	extensions: z.array(z.string()).optional(),
	mimes: z.array(z.string()).optional(),
	minSize: z.number().optional(),
	maxSize: z.number().optional(),
});

export type MailboxFilter = z.infer<typeof MailboxFilterSchema>;

export interface SyncStats {
	scannedMessages: number;
	savedAttachments: number;
	skipped: number;
	errors: number;
}
