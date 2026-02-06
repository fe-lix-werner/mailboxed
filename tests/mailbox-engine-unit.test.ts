import { expect, test, describe } from "bun:test";
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
        size: 100
      };
      const parts = engine.findAttachmentParts(structure);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({
        part: "1",
        filename: "test.pdf",
        mime: "application/pdf",
        size: 100
      });
    });

    test("should find attachment without explicit disposition if not text", () => {
      const structure = {
        part: "2",
        type: "image",
        subtype: "png",
        parameters: { filename: "image.png" },
        size: 200
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
            subtype: "plain"
          },
          {
            part: "2",
            type: "application",
            subtype: "octet-stream",
            disposition: "attachment",
            parameters: { filename: "data.bin" }
          }
        ]
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
                    childNodes: [{ type: "text", subtype: "plain", part: "1" }]
                },
                {
                    part: "2",
                    type: "image",
                    subtype: "jpeg",
                    disposition: "attachment",
                    parameters: { filename: "photo.jpg" }
                }
            ]
        };
        const parts = engine.findAttachmentParts(structure);
        expect(parts).toHaveLength(1);
        expect(parts[0].filename).toBe("photo.jpg");
    });
  });
});
