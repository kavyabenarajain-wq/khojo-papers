import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processAnswerImage, sniffImageType, ImageError } from "@/lib/storage/images";

describe("processAnswerImage", () => {
  it("normalises a photo to JPEG, applies orientation and strips metadata", async () => {
    const src = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#ffffff" } })
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "secret-location" } } })
      .jpeg()
      .toBuffer();
    const out = await processAnswerImage(src);
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("jpeg");
    expect([out.width, out.height]).toEqual([800, 1200]); // rotated by orientation 6
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("downsizes very large images", async () => {
    const src = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#eeeeee" } }).png().toBuffer();
    const out = await processAnswerImage(src);
    expect(Math.max(out.width, out.height)).toBe(2000);
  });

  it("rejects non-images, HEIC and tiny images with clear messages", async () => {
    await expect(processAnswerImage(Buffer.from("<script>alert(1)</script>........"))).rejects.toThrow(/isn't a JPEG/);
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(20)]);
    expect(sniffImageType(heic)).toBe("heic");
    await expect(processAnswerImage(heic)).rejects.toThrow(/HEIC/);
    const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    await expect(processAnswerImage(tiny)).rejects.toThrow(ImageError);
    const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    await expect(processAnswerImage(corrupt)).rejects.toThrow(/couldn't open/);
  });
});
