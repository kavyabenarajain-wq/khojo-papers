import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

export class ImageError extends Error {}

export function sniffImageType(buf: Buffer): "jpeg" | "png" | "webp" | "heic" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  const brand = buf.subarray(4, 12).toString("ascii");
  if (/^ftyp(heic|heix|hevc|mif1|msf1|heim|heis)/.test(brand)) return "heic";
  return null;
}

/**
 * Validate and normalise a photo of a handwritten answer: real decode (not just headers), pixel
 * limit against decompression bombs, auto-rotate from EXIF, strip all metadata (including GPS),
 * resize to at most 2000px and re-encode as JPEG.
 */
export async function processAnswerImage(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageError("That photo is larger than 8 MB. Try a smaller photo.");
  const type = sniffImageType(input);
  if (type === "heic") throw new ImageError("HEIC photos aren't supported. On iPhone, choose “Most Compatible” in Camera → Formats, or share the photo as JPEG.");
  if (!type) throw new ImageError("That file isn't a JPEG, PNG or WebP photo.");
  try {
    const img = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" });
    const meta = await img.metadata();
    if ((meta.width ?? 0) < 300 || (meta.height ?? 0) < 300) throw new ImageError("That photo is too small to read. Take it closer to the page.");
    const { data, info } = await img
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError("We couldn't open that image. It may be damaged; please take the photo again.");
  }
}
