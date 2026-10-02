# Retina Consultants of Miami — CE event check-in

Local demo built with React, TypeScript, shadcn/ui and Express. Uses the supplied branding. Starts with an empty attendee list.

## Open the demo

- Attendee: http://localhost:4173
- Staff: http://localhost:4173/staff
- Demo staff PIN: **2468**

Start with `npm install`, `npm run build`, then `npm start` from this folder. The running demo serves the built files; rebuild after source changes.

For phones, open **Staff → Check-in QR**. Connect the computer and phones to the same Wi-Fi, keep the computer awake, and scan the QR. Guest networks that isolate devices may prevent access; a shared tablet/computer also works. This is a local HTTP demo, not an internet deployment. Change the staff PIN with `STAFF_PIN=your-pin npm start` before using beyond a demo.

## Sign and print

1. Select or search for an attendee, confirm or edit name, OPC/license number, CE credit, and paid status, then draw a signature and submit. The signature confirms attendance and those details. Payment status is attendee-reported, not payment processing; the submitted details are retained in the backup as attendeeConfirmedDetails.
2. Use “Next attendee” for a shared device. “I’m not listed” collects name and license number and flags that person for staff follow-up.
3. Staff can edit license, CE credit and payment status. License edits save when the field loses focus. The dashboard refreshes every 5 seconds.
4. Choose **Print sign-in sheet** in Staff. Print or save as PDF. Use Letter, landscape; turn off browser headers/footers. All attendees appear in the original five-column format, including unsigned rows. Search filters do not limit printing.

Signatures and guest details save on this computer in `data/attendees.json`; they survive restarting the server. **Download backup** exports the full roster and signatures. Staff sessions require logging in again after a restart. Do not run multiple server processes against the same data file.

## Upload a list

Download the Excel template in Staff, fill it in, and upload `.xlsx` or CSV (5 MB maximum, up to 2,000 rows). The first worksheet is used.

Headers: **Name**, **License Number**, **CE Credit**, **Paid (Y/N)**.

- Name and License Number columns are required.
- CE Credit: YES, NO, or ? (blank becomes ?).
- Paid (Y/N): YES, NO, N/A, or blank.
- Uploads add new names. Existing names are matched case-insensitively and skipped, preserving their data and signatures. Invalid uploads are rejected before any rows are added.
- For this demo, uploads do not replace the roster or import signatures. PDF upload is not supported; the provided PDF was transcribed into the initial list.



## Verification

`node tests/demo.test.mjs` runs an isolated server on port 4174 with test data under the workspace's `work/verification` directory. Requires Google Chrome. Covers desktop and mobile layouts, drawing/submitting, duplicates, staff access, payment edits, CSV and Excel imports, invalid uploads, walk-ins, persistence to disk, QR generation, and print styling. `npm run build` checks TypeScript and builds the app.

This demo uses a shared staff PIN and an attendee name list, not identity verification. It is intended for reviewing the check-in flow locally. Internet hosting and production access controls are outside this demo.
