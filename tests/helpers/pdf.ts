/** Build a minimal valid PDF whose pages contain the given lines of text (Helvetica). */
export function makePdf(pages: string[][]): Buffer {
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) && objs.length;
  const fontId = 3;
  const pageIds: number[] = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  objs.push(""); // 2 placeholder for Pages
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"); // 3
  for (const lines of pages) {
    const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const stream = lines.length ? `BT /F1 12 Tf 50 780 Td 16 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET` : "";
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objs[1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
