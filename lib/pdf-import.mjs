import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const fonts = path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "standard_fonts/",
);
const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const label = (value) => clean(value).toLowerCase();

export function tableFromPage(text, annotations, pageNumber) {
  const headers = [
    "name",
    "license number",
    "ce credit",
    "paid (y/n)",
    "signature",
  ].map((name) => text.find((t) => label(t.s) === name));
  if (headers.some((h) => !h))
    throw Error(
      `Page ${pageNumber}: could not find the sign-in table columns. Use a PDF with selectable text and the same layout as the sign-in sheet, or upload Excel/CSV.`,
    );
  if (!headers.every((h, i) => !i || h.x > headers[i - 1].x))
    throw Error(
      `Page ${pageNumber}: the table columns are in an unsupported order.`,
    );
  const headerY = Math.min(...headers.map((h) => h.y));
  const widgets = annotations.filter(
    (a) => a.subtype === "Widget" && a.fieldType !== "Sig" && a.rect,
  );
  // Canonical form values take precedence over potentially stale appearance text.
  const points = text.filter(
    (t) =>
      t.y < headerY - 8 &&
      !widgets.some(
        (a) =>
          t.x >= a.rect[0] - 2 &&
          t.x <= a.rect[2] + 2 &&
          t.y >= a.rect[1] - 2 &&
          t.y <= a.rect[3] + 2,
      ),
  );
  for (const a of widgets) {
    const s = clean(
      Array.isArray(a.fieldValue) ? a.fieldValue.join(" ") : a.fieldValue,
    );
    if (s) points.push({ s, x: a.rect[0], y: (a.rect[1] + a.rect[3]) / 2 });
  }
  const groups = [];
  for (const p of points
    .filter((p) => clean(p.s) && p.y < headerY - 8)
    .sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (p.x < headers[0].x - 5 || p.x >= headers[4].x - 5) continue;
    let row = groups.find((r) => Math.abs(r.y - p.y) < 5);
    if (!row) {
      row = { y: p.y, cells: [[], [], [], []] };
      groups.push(row);
    }
    let column = 0;
    for (let i = 1; i < 4; i++) if (p.x >= headers[i].x - 5) column = i;
    row.cells[column].push(p);
  }
  return groups
    .map((row) => {
      const cells = row.cells.map((parts) =>
        clean(
          parts
            .sort((a, b) => a.x - b.x)
            .map((p) => p.s)
            .join(" "),
        ),
      );
      if (!cells[0] && cells.slice(1).some(Boolean))
        throw Error(
          `Page ${pageNumber}: a row has details but no readable name. Please upload Excel/CSV instead.`,
        );
      const rawPaid = cells[3];
      const paid = rawPaid.toUpperCase();
      cells[3] = ["YES", "NO", "N/A", ""].includes(paid) ? paid : "";
      cells.push(cells[3] === paid ? "" : rawPaid);
      return cells;
    })
    .filter((cells) => cells[0]);
}

export async function readSignInPdf(buffer) {
  let task;
  try {
    task = getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      disableFontFace: true,
      standardFontDataUrl: fonts,
      verbosity: 0,
    });
    const doc = await task.promise;
    if (doc.numPages > 30) throw Error("Upload a PDF with 30 pages or fewer.");
    const rows = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .filter((i) => typeof i.str === "string" && i.str.trim())
        .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] }));
      const annotations = await page.getAnnotations();
      rows.push(...tableFromPage(text, annotations, n));
      page.cleanup();
    }
    if (!rows.length)
      throw Error(
        "No attendees could be read. Scanned photos are not supported; use a PDF with selectable text or fillable fields, or upload Excel/CSV.",
      );
    return [
      ["Name", "License Number", "CE Credit", "Paid (Y/N)", "Payment note"],
      ...rows,
    ];
  } catch (e) {
    if (e.name === "PasswordException")
      throw Error(
        "This PDF is password-protected. Upload an unlocked copy or Excel/CSV.",
      );
    throw e;
  } finally {
    await task?.destroy?.();
  }
}
