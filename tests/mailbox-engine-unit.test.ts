import { describe, expect, test } from "bun:test";
import { MailboxEngine } from "../src/services/mailbox-engine";

describe("MailboxEngine", () => {
	const engine = new MailboxEngine();

	describe("findAttachmentParts", () => {
		test("should find simple attachment", () => {
			const structure = {
				part: "1",
				type: "application",
				subtype: "pdf",
				disposition: "attachment",
				parameters: { filename: "test.pdf" },
				size: 100,
			};
			const parts = engine.findAttachmentParts(structure);
			expect(parts).toHaveLength(1);
			expect(parts[0]).toEqual({
				part: "1",
				filename: "test.pdf",
				mime: "application/pdf",
				size: 100,
			});
		});

		test("should find attachment without explicit disposition if not text", () => {
			const structure = {
				part: "2",
				type: "image",
				subtype: "png",
				parameters: { filename: "image.png" },
				size: 200,
			};
			const parts = engine.findAttachmentParts(structure);
			expect(parts).toHaveLength(1);
			expect(parts[0].filename).toBe("image.png");
		});

		test("should recurse into child nodes", () => {
			const structure = {
				type: "multipart",
				subtype: "mixed",
				childNodes: [
					{
						part: "1",
						type: "text",
						subtype: "plain",
					},
					{
						part: "2",
						type: "application",
						subtype: "octet-stream",
						disposition: "attachment",
						parameters: { filename: "data.bin" },
					},
				],
			};
			const parts = engine.findAttachmentParts(structure);
			expect(parts).toHaveLength(1);
			expect(parts[0].filename).toBe("data.bin");
		});

			test("should handle deeply nested attachments", () => {
				const structure = {
					type: "multipart",
					subtype: "mixed",
					childNodes: [
						{
							type: "multipart",
							subtype: "alternative",
							childNodes: [{ type: "text", subtype: "plain", part: "1" }],
						},
						{
							part: "2",
							type: "image",
							subtype: "jpeg",
							disposition: "attachment",
							parameters: { filename: "photo.jpg" },
						},
					],
				};
				const parts = engine.findAttachmentParts(structure);
				expect(parts).toHaveLength(1);
				expect(parts[0].filename).toBe("photo.jpg");
			});
			test("should handle IONOS format with combined type (application/pdf)", () => {
				const structure = {
					type: "multipart/mixed",
					childNodes: [
						{
							part: "1",
							type: "application/pdf",
							disposition: "attachment",
							dispositionParameters: { filename: "document.pdf" },
							size: 12345,
						},
					],
				};
				const parts = engine.findAttachmentParts(structure);
				expect(parts).toHaveLength(1);
				expect(parts[0]).toEqual({
					part: "1",
					filename: "document.pdf",
					mime: "application/pdf",
					size: 12345,
				});
			});

		test("should address a message that is a single PDF part as part 1", () => {
			const structure = {
				type: "application/pdf",
				encoding: "base64",
				size: 1000,
				disposition: "attachment",
				dispositionParameters: { filename: "Rechnung.pdf" },
			};
			const parts = engine.findAttachmentParts(structure);
			expect(parts).toHaveLength(1);
			expect(parts[0].part).toBe("1");
			expect(parts[0].filename).toBe("Rechnung.pdf");
		});

		test("should pick up a PDF part without filename or disposition", () => {
			const structure = {
				type: "multipart/mixed",
				childNodes: [
					{ part: "1", type: "text/plain" },
					{ part: "2", type: "application/pdf", size: 1000 },
				],
			};
			const parts = engine.findAttachmentParts(structure);
			expect(parts).toEqual([
				{
					part: "2",
					filename: "unnamed.pdf",
					mime: "application/pdf",
					size: 1000,
				},
			]);
		});

		test("should not treat body text, inline images or signatures as attachments", () => {
			const structure = {
				type: "multipart/signed",
				childNodes: [
					{
						part: "1",
						type: "multipart/related",
						childNodes: [
							{ part: "1.1", type: "text/html" },
							{ part: "1.2", type: "image/png", id: "<logo>" },
						],
					},
					{ part: "2", type: "application/pkcs7-signature" },
				],
			};
			expect(engine.findAttachmentParts(structure)).toHaveLength(0);
		});

		test("should not treat a plain text message as an attachment", () => {
			expect(
				engine.findAttachmentParts({ type: "text/plain", size: 10 }),
			).toHaveLength(0);
		});
	});
});
