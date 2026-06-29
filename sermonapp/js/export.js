// PDF + Word (.docx) export, generated entirely in-browser.
// Libraries load on demand from a CDN (only when you actually export), so the
// offline core stays small.
import { el, fmtDate } from "./ui.js";

function notesToBlocks(sermon) {
  const blocks = [
    { type: "title", text: sermon.title || "Sermon" },
    { type: "meta", text: [sermon.attended === false ? "Not attended" : (sermon.kind || "Sermon"), sermon.speaker, fmtDate(sermon.date)].filter(Boolean).join(" · ") },
  ];
  const n = sermon.notes;
  if (n && typeof n === "object" && !n.raw) {
    if (n.summary) blocks.push({ type: "h2", text: "Summary" }, { type: "p", text: n.summary });
    if (Array.isArray(n.scriptures) && n.scriptures.length)
      blocks.push({ type: "h2", text: "Scriptures" }, { type: "p", text: n.scriptures.join(", ") });
    for (const sec of n.sections || []) {
      blocks.push({ type: "h2", text: sec.heading || "Notes" });
      for (const p of sec.points || []) blocks.push({ type: "bullet", text: p });
    }
    if (Array.isArray(n.takeaways) && n.takeaways.length) {
      blocks.push({ type: "h2", text: "Takeaways" });
      for (const t of n.takeaways) blocks.push({ type: "bullet", text: t });
    }
  } else if (n && n.raw) {
    blocks.push({ type: "h2", text: "Notes" }, { type: "p", text: n.raw });
  }
  if (sermon.transcript) blocks.push({ type: "h2", text: "Transcript" }, { type: "p", text: sermon.transcript });
  return blocks;
}

function filename(sermon, ext) {
  const base = (sermon.title || "sermon").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "sermon";
  return `${base}_${sermon.date}.${ext}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportPDF(sermon) {
  const { PDFDocument, StandardFonts, rgb } = await import("https://esm.sh/pdf-lib@1");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 56, pageW = 595.28, pageH = 841.89, maxW = pageW - margin * 2; // A4
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const ensure = (space) => { if (y - space < margin) { page = doc.addPage([pageW, pageH]); y = pageH - margin; } };
  const wrap = (text, f, size) => {
    const lines = [];
    for (const para of String(text).split(/\n/)) {
      let line = "";
      for (const w of para.split(/\s+/)) {
        const test = line ? line + " " + w : w;
        if (line && f.widthOfTextAtSize(test, size) > maxW) { lines.push(line); line = w; }
        else line = test;
      }
      lines.push(line);
    }
    return lines;
  };
  const draw = (text, { f = font, size = 11, gap = 4, indent = 0, color } = {}) => {
    for (const ln of wrap(text, f, size)) {
      ensure(size + gap);
      page.drawText(ln, { x: margin + indent, y: y - size, size, font: f, color: color || rgb(0.1, 0.1, 0.12) });
      y -= size + gap;
    }
  };

  for (const b of notesToBlocks(sermon)) {
    if (b.type === "title") draw(b.text, { f: bold, size: 20, gap: 6 });
    else if (b.type === "meta") draw(b.text, { size: 10, gap: 12, color: rgb(0.45, 0.45, 0.5) });
    else if (b.type === "h2") { y -= 8; draw(b.text, { f: bold, size: 13, gap: 6 }); }
    else if (b.type === "bullet") {
      wrap(b.text, font, 11).forEach((ln, i) => {
        ensure(15);
        page.drawText(i === 0 ? "•" : "", { x: margin, y: y - 11, size: 11, font });
        page.drawText(ln, { x: margin + 14, y: y - 11, size: 11, font });
        y -= 15;
      });
    } else { draw(b.text, { size: 11, gap: 4 }); y -= 4; }
  }

  const bytes = await doc.save();
  download(new Blob([bytes], { type: "application/pdf" }), filename(sermon, "pdf"));
}

export async function exportDOCX(sermon) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("https://esm.sh/docx@8");
  const kids = notesToBlocks(sermon).map((b) => {
    if (b.type === "title") return new Paragraph({ text: b.text, heading: HeadingLevel.TITLE });
    if (b.type === "meta") return new Paragraph({ children: [new TextRun({ text: b.text, italics: true, color: "777777" })] });
    if (b.type === "h2") return new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2, spacing: { before: 200 } });
    if (b.type === "bullet") return new Paragraph({ text: b.text, bullet: { level: 0 } });
    return new Paragraph({ text: b.text });
  });
  const doc = new Document({ sections: [{ children: kids }] });
  download(await Packer.toBlob(doc), filename(sermon, "docx"));
}
