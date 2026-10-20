import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";

export const MAX_PDF_BYTES = 40 * 1024 * 1024;
export const MAX_PDF_PAGES = 60;

export function isPdf(buf: Buffer): boolean {
  return buf.subarray(0, 5).toString("ascii") === "%PDF-";
}

/** Text layer per page (empty strings for scanned pages). */
export async function extractPdfPages(buf: Buffer): Promise<{ pageNumber: number; text: string }[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`The PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}. Split it first.`);
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((t, i) => ({ pageNumber: i + 1, text: t ?? "" }));
}

/** Render one page as a PNG data URL (for OCR and for side-by-side review). */
export async function renderPdfPage(buf: Buffer, pageNumber: number, width = 1400): Promise<string> {
  return renderPageAsImage(new Uint8Array(buf), pageNumber, { canvasImport: () => import("@napi-rs/canvas"), width, toDataURL: true });
}
