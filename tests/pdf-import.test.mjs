import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tableFromPage, readSignInPdf } from "../lib/pdf-import.mjs";
const headers = [
  "Name",
  "License Number",
  "CE Credit",
  "Paid (Y/N)",
  "Signature",
].map((s, i) => ({ s, x: [30, 230, 375, 490, 590][i], y: 530 }));
test("fillable fields preserve blanks and free-text payment notes", () => {
  const annotations = ["Dr. Test", "OPC", "?", "TEXTED ON 9/30"].map(
    (fieldValue, i) => ({
      subtype: "Widget",
      fieldType: "Tx",
      fieldValue,
      rect: [[30, 230, 375, 490][i], 480, [225, 370, 485, 585][i], 500],
    }),
  );
  const rows = tableFromPage(headers, annotations, 1);
  assert.deepEqual(rows, [["Dr. Test", "OPC", "?", "", "TEXTED ON 9/30"]]);
});
test("flattened selectable text preserves column alignment and ignores signatures", () => {
  const text = [
    ...headers,
    ...["Dr. Test", "OPC 123", "YES", "N/A", "signature text"].map((s, i) => ({
      s,
      x: [30, 230, 375, 490, 590][i],
      y: 490,
    })),
  ];
  assert.deepEqual(tableFromPage(text, [], 1), [
    ["Dr. Test", "OPC 123", "YES", "N/A", ""],
  ]);
});
test("unreadable pages are rejected instead of partially imported", () => {
  assert.throws(() => tableFromPage([], [], 2), /Page 2/);
});
test(
  "supplied PDF imports all 12 form rows and keeps payment note",
  { skip: !process.env.PDF_FIXTURE },
  async () => {
    const matrix = await readSignInPdf(
      fs.readFileSync(process.env.PDF_FIXTURE),
    );
    assert.equal(matrix.length, 13);
    assert.equal(matrix[1][1], "OPC 3342");
    assert.equal(matrix[6][3], "");
    assert.equal(matrix[6][4], "TEXTED ON 9/30");
  },
);
