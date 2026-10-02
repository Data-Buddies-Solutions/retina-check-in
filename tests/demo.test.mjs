import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const scratch = path.resolve("../../work/verification");
fs.mkdirSync(scratch, { recursive: true });
const data = path.join(scratch, "test-attendees.json");
fs.rmSync(data, { force: true });
const fixture = Array.from({ length: 12 }, (_, i) => ({
  id: `test-${i}`,
  name: i === 0 ? "Dr. Alex Rivera" : `Dr. Test Attendee ${i}`,
  license: i === 0 ? "OPC 3342" : "N/A",
  ce: "YES",
  paid: "",
  signature: null,
  signedAt: null,
  walkIn: false,
}));
fs.writeFileSync(data, JSON.stringify(fixture));
const server = spawn(process.execPath, ["server.mjs"], {
  env: { ...process.env, PORT: "4174", DATA_FILE: data, DATABASE_URL: "" },
  stdio: "pipe",
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("error", reject);
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
      viewport: { width: 1360, height: 980 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4174");
  await page.getByRole("button", { name: "Dr. Alex Rivera" }).waitFor();
  await page.screenshot({
    path: path.join(scratch, "desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dr. Alex Rivera" }).click();
  await page.getByLabel("Full name").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Submit signature" }).isEnabled(),
    false,
  );
  async function draw(p) {
    const box = await p.locator("canvas").boundingBox();
    await p.mouse.move(box.x + 35, box.y + 80);
    await p.mouse.down();
    for (let i = 0; i < 35; i++)
      await p.mouse.move(
        box.x + 35 + i * 5,
        box.y + 80 + Math.sin(i * 0.55) * 25,
      );
    await p.mouse.up();
  }
  assert.equal(
    await page.getByLabel("OPC / license number").inputValue(),
    "OPC 3342",
  );
  await page.getByLabel("Full name").fill("Dr. Alex Rivera Jr.");
  await page.getByLabel("OPC / license number").fill("OPC 3343");
  await page.getByRole("combobox", { name: "Have you paid?" }).click();
  await page.getByRole("option", { name: "NO", exact: true }).click();
  await page.getByRole("combobox", { name: "CE credit requested" }).click();
  await page.getByRole("option", { name: "NO", exact: true }).click();
  await draw(page);
  await page.getByRole("button", { name: "Submit signature" }).click();
  await page.getByText("Successfully signed in").waitFor();
  const guestRows = await (
    await page.request.get("http://localhost:4174/api/attendees")
  ).json();
  assert.ok(guestRows[0].signedAt);
  assert.equal(guestRows[0].signature, undefined);
  assert.equal(guestRows[0].paid, undefined);
  const duplicate = await page.request.post("http://localhost:4174/api/sign", {
    data: { id: guestRows[0].id, signature: "data:image/png;base64,YQ==" },
  });
  assert.equal(duplicate.status(), 409);
  const staff = await context.newPage();
  await staff.goto("http://localhost:4174/staff");
  await staff.getByLabel("Staff PIN").fill("2468");
  await staff.getByRole("button", { name: "Open event dashboard" }).click();
  await staff.getByText("Your event, at a glance.").waitFor();
  await staff
    .getByAltText("Signature of Dr. Alex Rivera Jr.")
    .first()
    .waitFor();
  const rows = await (
    await staff.request.get("http://localhost:4174/api/staff")
  ).json();
  assert.equal(rows.length, 12);
  assert.equal(rows[0].name, "Dr. Alex Rivera Jr.");
  assert.equal(rows[0].license, "OPC 3343");
  assert.equal(rows[0].ce, "NO");
  assert.equal(rows[0].paid, "NO");
  assert.equal(rows[0].attendeeConfirmedDetails.paid, "NO");
  assert.ok(rows[0].signature.startsWith("data:image/png"));
  await staff
    .getByRole("combobox", { name: "Paid status for Dr. Alex Rivera Jr." })
    .click();
  await staff.getByRole("option", { name: "YES", exact: true }).click();
  await staff.waitForTimeout(250);
  assert.equal(
    (
      await (await staff.request.get("http://localhost:4174/api/staff")).json()
    )[0].paid,
    "YES",
  );
  await staff.screenshot({
    path: path.join(scratch, "staff.png"),
    fullPage: true,
  });
  await staff.emulateMedia({ media: "print" });
  await staff.screenshot({
    path: path.join(scratch, "print.png"),
    fullPage: true,
  });
  assert.equal(await staff.locator(".print-sheet tbody tr").count(), 12);
  assert.ok(await staff.locator(".print-sheet").isVisible());
  await staff.emulateMedia({ media: "screen" });
  const imported = await staff.request.post(
    "http://localhost:4174/api/import",
    {
      multipart: {
        file: {
          name: "guests.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "Name,License Number,CE Credit,Paid (Y/N)\nDr. CSV Test,OPC 9999,YES,YES\nDr. Alex Rivera Jr.,OPC 3342,NO,NO",
          ),
        },
      },
    },
  );
  assert.equal(imported.status(), 200);
  assert.match((await imported.json()).message, /Added 1 attendees/);
  const template = await staff.request.get(
    "http://localhost:4174/api/template",
  );
  const ExcelJS = (await import("exceljs")).default,
    wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await template.body());
  wb.worksheets[0].getCell("A2").value = "Dr. Excel Test";
  const excelResult = await staff.request.post(
    "http://localhost:4174/api/import",
    {
      multipart: {
        file: {
          name: "guests.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: Buffer.from(await wb.xlsx.writeBuffer()),
        },
      },
    },
  );
  assert.equal(excelResult.status(), 200);
  assert.match((await excelResult.json()).message, /Added 1 attendees/);
  const invalid = await staff.request.post("http://localhost:4174/api/import", {
    multipart: {
      file: {
        name: "bad.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Name,License Number,CE Credit\nBad,123,MAYBE"),
      },
    },
  });
  assert.equal(invalid.status(), 400);
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  await phone.goto("http://localhost:4174");
  await phone.getByRole("button", { name: "I’m not listed" }).waitFor();
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await phone.screenshot({
    path: path.join(scratch, "mobile.png"),
    fullPage: true,
  });
  await phone.getByRole("button", { name: "I’m not listed" }).click();
  await phone.getByLabel("Full name").fill("Dr. Walk In");
  await phone.getByLabel("OPC / license number").fill("OPC 5555");
  await draw(phone);
  await phone.screenshot({
    path: path.join(scratch, "mobile-sign.png"),
    fullPage: true,
  });
  await phone.getByRole("button", { name: "Submit signature" }).click();
  await phone.getByText("Successfully signed in").waitFor();
  const finalRows = await (
    await staff.request.get("http://localhost:4174/api/staff")
  ).json();
  assert.equal(finalRows.length, 15);
  assert.equal(finalRows.at(-1).walkIn, true);
  assert.equal(finalRows[0].signature, rows[0].signature);
  assert.equal(JSON.parse(fs.readFileSync(data)).length, 15);
  const unauthorized = await phone.request.get(
    "http://localhost:4174/api/staff",
  );
  assert.equal(unauthorized.status(), 401);
  const connection = await (
    await staff.request.get("http://localhost:4174/api/connection")
  ).json();
  assert.match(connection.qr, /^data:image\/png/);
  assert.equal(errors.length, 0);
  console.log(
    "PASS: desktop/mobile, drawn signature, duplicate protection, staff permissions, paid edit, print layout, CSV/XLSX imports, invalid upload, walk-in, disk persistence, QR, no browser errors.",
  );
} finally {
  await browser?.close();
  server.kill();
}
