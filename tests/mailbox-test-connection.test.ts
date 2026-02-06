import { describe, expect, it, mock } from "bun:test";
import { MailboxEngine } from "../src/services/mailbox-engine";

describe("MailboxEngine Test Connection", () => {
	it("should return success when connection is successful", async () => {
		const mockClient = {
			connect: mock(async () => {}),
			logout: mock(async () => {}),
		};
		const engine = new MailboxEngine((_options) => mockClient as any);

		const result = await engine.testConnection({
			host: "imap.example.com",
			port: 993,
			tlsMode: "tls",
			username: "test@example.com",
			password: "password123",
		});

		expect(result.success).toBe(true);
		expect(mockClient.connect).toHaveBeenCalled();
		expect(mockClient.logout).toHaveBeenCalled();
	});

	it("should return error when connection fails", async () => {
		const mockClient = {
			connect: mock(async () => {
				throw new Error("Connection timed out");
			}),
			logout: mock(async () => {}),
		};
		const engine = new MailboxEngine((_options) => mockClient as any);

		const result = await engine.testConnection({
			host: "imap.example.com",
			port: 993,
			tlsMode: "tls",
			username: "test@example.com",
			password: "password123",
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe("Connection timed out");
	});
});
