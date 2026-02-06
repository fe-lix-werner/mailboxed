import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { AttachmentProcessor, type AttachmentInfo } from "../src/services/attachment-processor";
import { db } from "../src/db";
import { downloads } from "../src/db/schema";
import { rm, mkdir } from "fs/promises";
import { setupTestDb } from "./test-utils";

describe("AttachmentProcessor", () => {
  const testDownloadRoot = "test-downloads";
  
  beforeEach(async () => {
    process.env.DOWNLOAD_ROOT = testDownloadRoot;
    await setupTestDb();
    await mkdir(testDownloadRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDownloadRoot, { recursive: true, force: true });
  });

  const baseInfo: Omit<AttachmentInfo, "content" | "filename" | "mime" | "size"> = {
    mailboxId: 1,
    folder: "INBOX",
    messageUid: 100,
    messageDate: new Date("2024-01-01T12:00:00Z"),
    from: "test@example.com",
    subject: "Test Subject",
    attachmentPartId: "1.1",
  };

  test("should save attachment when it matches filters", async () => {
    const processor = new AttachmentProcessor(1, "TestMailbox", "base", {
      extensions: ["pdf"],
      mimes: ["application/pdf"],
    });

    const info: AttachmentInfo = {
      ...baseInfo,
      filename: "test.pdf",
      mime: "application/pdf",
      size: 1024,
      content: Buffer.from("dummy pdf content"),
    };

    const result = await processor.process(info);
    expect(result.saved).toBe(true);
    expect(result.skipped).toBe(false);

    // Verify it's in DB
    const record = await db.query.downloads.findFirst();
    expect(record).toBeDefined();
    expect(record?.filename).toBe("test.pdf");
  });

  test("should skip attachment when it doesn't match extension filter", async () => {
    const processor = new AttachmentProcessor(1, "TestMailbox", "base", {
      extensions: ["pdf"],
    });

    const info: AttachmentInfo = {
      ...baseInfo,
      filename: "test.txt",
      mime: "text/plain",
      size: 1024,
      content: Buffer.from("dummy text content"),
    };

    const result = await processor.process(info);
    expect(result.saved).toBe(false);
    expect(result.skipped).toBe(true);
  });

  test("should skip attachment when it doesn't match MIME filter (wildcard)", async () => {
    const processor = new AttachmentProcessor(1, "TestMailbox", "base", {
      mimes: ["image/*"],
    });

    const info: AttachmentInfo = {
      ...baseInfo,
      filename: "test.pdf",
      mime: "application/pdf",
      size: 1024,
      content: Buffer.from("dummy pdf content"),
    };

    const result = await processor.process(info);
    expect(result.saved).toBe(false);
    expect(result.skipped).toBe(true);

    const infoImage: AttachmentInfo = {
        ...baseInfo,
        filename: "test.png",
        mime: "image/png",
        size: 1024,
        content: Buffer.from("dummy image content"),
    };
    const resultImage = await processor.process(infoImage);
    expect(resultImage.saved).toBe(true);
  });

  test("should skip attachment when size is out of bounds", async () => {
    const processor = new AttachmentProcessor(1, "TestMailbox", "base", {
      minSize: 2000,
    });

    const info: AttachmentInfo = {
      ...baseInfo,
      filename: "test.txt",
      mime: "text/plain",
      size: 1000,
      content: Buffer.from("short"),
    };

    const result = await processor.process(info);
    expect(result.saved).toBe(false);
    expect(result.skipped).toBe(true);
  });

  test("should deduplicate by mailbox/folder/uid/part", async () => {
    const processor = new AttachmentProcessor(1, "TestMailbox", "base", {});

    const info: AttachmentInfo = {
      ...baseInfo,
      filename: "test.txt",
      mime: "text/plain",
      size: 10,
      content: Buffer.from("content"),
    };

    const result1 = await processor.process(info);
    expect(result1.saved).toBe(true);

    const result2 = await processor.process(info);
    expect(result2.saved).toBe(false);
    expect(result2.skipped).toBe(true);
  });
});
