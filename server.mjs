import express from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import QRCode from "qrcode";
import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import * as store from "./lib/store.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
const app = express(),
  port = Number(process.env.PORT || 4173),
  root = import.meta.dirname;
const pin = process.env.STAFF_PIN || (process.env.VERCEL ? "" : "2468");
if (!pin) throw new Error("STAFF_PIN is required on Vercel");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sessionHash = (req) => {
  const token = (req.headers.cookie || "")
    .split("; ")
    .find((x) => x.startsWith("staff="))
    ?.slice(6);
  return token ? hash(token) : null;
};
app.use(express.json({ limit: "1mb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.headers.origin && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const expected =
      process.env.PUBLIC_SITE_URL ||
      `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers.host}`;
    if (req.headers.origin !== new URL(expected).origin)
      return res
        .status(403)
        .json({ error: "Please submit from the event website." });
  }
  next();
});
async function staff(req, res, next) {
  if (!(await store.hasSession(sessionHash(req))))
    return res.status(401).json({ error: "Enter the staff PIN to continue." });
  next();
}
app.post("/api/login", async (req, res) => {
  const ip = String(
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
  )
    .split(",")[0]
    .trim();
  if (!(await store.allowLogin(hash(ip))))
    return res
      .status(429)
      .json({ error: "Too many attempts. Please try again in 15 minutes." });
  const candidate = typeof req.body.pin === "string" ? req.body.pin : "";
  if (!timingSafeEqual(Buffer.from(hash(candidate)), Buffer.from(hash(pin))))
    return res.status(401).json({ error: "That PIN is incorrect." });
  const token = randomBytes(32).toString("hex");
  await store.createSession(hash(token), new Date(Date.now() + 43200000));
  res.cookie("staff", token, {
    httpOnly: true,
    secure: Boolean(process.env.VERCEL),
    sameSite: "strict",
    maxAge: 43200000,
  });
  res.json({ ok: true });
});
app.post("/api/logout", async (req, res) => {
  await store.deleteSession(sessionHash(req));
  res.clearCookie("staff");
  res.json({ ok: true });
});
app.get("/api/attendees", async (_req, res) =>
  res.json(
    (await store.list()).map(({ id, name, signedAt }) => ({
      id,
      name,
      signedAt,
    })),
  ),
);
app.get("/api/staff", staff, async (_req, res) => res.json(await store.list()));
app.get("/api/attendees/:id", async (req, res) => {
  const person = await store.get(req.params.id);
  if (!person)
    return res
      .status(404)
      .json({ error: "Attendee not found. Please select your name again." });
  const { id, name, license, ce, paid, signedAt } = person;
  res.json({ id, name, license, ce, paid, signedAt });
});
app.post("/api/sign", async (req, res) => {
  const { id, name, license, ce, paid, signature } = req.body;
  if (
    typeof signature !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) ||
    signature.length > 700000
  )
    return res.status(400).json({ error: "Please add your signature." });
  const person = id ? await store.get(id) : null;
  if (id && !person)
    return res
      .status(404)
      .json({ error: "Attendee not found. Please select your name again." });
  if (person?.signedAt)
    return res.status(409).json({
      error:
        "You are already signed in. Please see the registration desk for changes.",
    });
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 150 ||
    typeof license !== "string" ||
    !license.trim() ||
    license.length > 80
  )
    return res
      .status(400)
      .json({ error: "Enter your name and license number (or N/A)." });
  if (
    !["", "YES", "NO", "?"].includes(ce) ||
    !["YES", "NO", "N/A", ""].includes(paid)
  )
    return res
      .status(400)
      .json({ error: "Choose a valid CE credit and payment status." });
  const details = { name: name.trim(), license: license.trim(), ce, paid };
  const signed = await store.sign(id, details, signature);
  res.json({ ok: true, name: signed.name });
});
app.patch("/api/staff/:id", staff, async (req, res) => {
  const person = await store.get(req.params.id);
  if (!person) return res.status(404).json({ error: "Attendee not found." });
  const { ce, paid, license } = req.body;
  if (
    !["", "YES", "NO", "?"].includes(ce) ||
    !["YES", "NO", "N/A", ""].includes(paid) ||
    typeof license !== "string" ||
    license.length > 80
  )
    return res.status(400).json({ error: "Invalid attendee details." });
  await store.update(person.id, { ce, paid, license });
  res.json({ ok: true });
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});
const cell = (v) =>
  v == null
    ? ""
    : typeof v === "object"
      ? v.text || v.result || v.richText?.map((t) => t.text).join("") || ""
      : String(v);
app.post("/api/import", staff, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) throw Error("Choose a PDF, CSV or .xlsx file.");
    let matrix;
    if (req.file.originalname.toLowerCase().endsWith(".pdf")) {
      const { readSignInPdf } = await import("./lib/pdf-import.mjs");
      matrix = await readSignInPdf(req.file.buffer);
    } else if (req.file.originalname.toLowerCase().endsWith(".csv"))
      matrix = parse(req.file.buffer, { bom: true, skip_empty_lines: true });
    else if (req.file.originalname.toLowerCase().endsWith(".xlsx")) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      matrix = [];
      wb.worksheets[0].eachRow((r) =>
        matrix.push(
          Array.from({ length: r.cellCount }, (_, i) =>
            cell(r.getCell(i + 1).value),
          ),
        ),
      );
    } else throw Error("Use a PDF, CSV or .xlsx file.");
    const headers = matrix.shift()?.map((v) => String(v).trim().toLowerCase());
    const idx = (label) => headers?.indexOf(label);
    if (idx("name") < 0 || idx("license number") < 0)
      throw Error(
        "The first row must include Name and License Number. Download the template for an example.",
      );
    const incoming = matrix
      .map((r, i) => ({ r, rowNumber: i + 2 }))
      .filter(({ r }) => r.some((v) => String(v ?? "").trim()))
      .map(({ r, rowNumber }) => {
        const get = (label) => String(r[idx(label)] || "").trim();
        const name = get("name"),
          license = get("license number"),
          ce = get("ce credit").toUpperCase(),
          paid = get("paid (y/n)").toUpperCase(),
          paidNote = get("payment note");
        if (
          !name ||
          name.length > 150 ||
          license.length > 80 ||
          paidNote.length > 500 ||
          !["", "YES", "NO", "?"].includes(ce) ||
          !["YES", "NO", "N/A", ""].includes(paid)
        )
          throw Error(
            `Check row ${rowNumber}: name, CE credit (YES/NO/? or blank), or paid status (YES/NO/N/A or blank).`,
          );
        return {
          id: randomUUID(),
          name,
          license,
          ce,
          paid,
          paidNote,
          signature: null,
          signedAt: null,
          walkIn: false,
        };
      });
    if (!incoming.length || incoming.length > 2000)
      throw Error("Upload between 1 and 2,000 attendees.");
    if (req.query.preview === "true")
      return res.json({ attendees: incoming, count: incoming.length });
    const count = await store.importRows(incoming);
    const notes = incoming.filter((r) => r.paidNote).length;
    res.json({
      message: `Added ${count} attendees. Skipped ${incoming.length - count} existing or duplicate names. Existing signatures were kept.${notes ? ` ${notes} payment note(s) preserved for staff review.` : ""}`,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/template", staff, async (_req, res) => {
  const wb = new ExcelJS.Workbook(),
    ws = wb.addWorksheet("Attendees");
  ws.addRow(["Name", "License Number", "CE Credit", "Paid (Y/N)"]);
  ws.addRow(["Dr. Example Name", "OPC 1234", "YES", ""]);
  ws.columns.forEach((c) => (c.width = 24));
  res.attachment("attendee-template.xlsx");
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});
app.get("/api/connection", staff, async (_req, res) => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((x) => x.family === "IPv4" && !x.internal)
    .map((x) => x.address);
  const address =
    addresses.find((x) => x.startsWith("192.168.")) ||
    addresses.find((x) => x.startsWith("10.")) ||
    addresses[0] ||
    "localhost";
  const url =
    process.env.PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : `http://${address}:${port}`);
  res.json({
    url,
    local: !process.env.VERCEL,
    qr: await QRCode.toDataURL(url, {
      width: 240,
      margin: 1,
      color: { dark: "#092b46", light: "#ffffff" },
    }),
  });
});
app.get("/api/backup", staff, async (_req, res) => {
  res.attachment("sign-in-backup.json").json(await store.list());
});
app.use(express.static(path.join(root, "dist")));
app.get("/{*splat}", (_req, res) =>
  res.sendFile(path.join(root, "dist/index.html")),
);
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(err.status || 400).json({
    error: err.status
      ? err.message
      : err.code === "LIMIT_FILE_SIZE"
        ? "The upload must be under 4 MB."
        : "The request could not be saved. Please try again.",
  });
});
export default app;
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  app.listen(port, "0.0.0.0", () =>
    console.log(`Retina check-in: http://localhost:${port}`),
  );
