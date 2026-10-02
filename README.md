# Retina Consultants of Miami — event check-in

A simple phone/tablet check-in site using React, shadcn/ui, Express, Prisma, and Postgres. The attendee list starts empty.

## Event team

- Open `/staff` and enter the staff PIN supplied separately.
- Download the Excel template, add attendees, then upload PDF, `.xlsx` or CSV (up to 4 MB and 2,000 rows).
- Required headers: **Name**, **License Number**. Optional: **CE Credit** (YES / NO / ?), **Paid (Y/N)** (YES / NO / N/A / blank).
- Uploads add new names, skipping existing names case-insensitively. They never overwrite existing signatures.
- Share the attendee homepage or the dashboard's **Check-in QR**.
- Attendees select their name, confirm or edit their details, sign with a finger/mouse, and submit. “I’m not listed” adds a walk-in for follow-up.
- Payment status is attendee-reported. This app does not process or independently verify payments.
- The dashboard updates every five seconds. Staff can edit license, CE and paid fields. License edits save on blur.
- **Print sign-in sheet** prints all attendees and signatures in the original five columns, including unsigned rows. Use Letter landscape and turn off browser headers/footers. The browser can also save it as a PDF.
- **Download backup** exports all records and signature images as JSON. The original attendee-confirmed details are retained even if staff later edit fields.

PDF uploads support the supplied five-column sign-in format, including fillable forms and selectable text across multiple pages (up to 30). Scanned photos and password-protected PDFs are not supported. Payment-cell notes are preserved separately for staff review and printing; they are never treated as proof of payment. Existing signatures in a PDF are not imported.

## Local development

Requires Node 22 or 24. Run `npm ci`, `npm run build`, then `npm start`. Open http://localhost:4173. Without DATABASE_URL, data is stored in ignored `data/attendees.json` and the local demo PIN is 2468. With DATABASE_URL, Prisma uses Postgres. Load local environment variables explicitly with `node --env-file=.env server.mjs` when using Postgres.

## Hosting

The public GitHub repository is connected to Kyle Shechtman’s Vercel project. Vercel serves the Vite build and `/api/index.mjs` handles the API. `vercel.json` defines the routes.

1. Use the dedicated retina-check-in-db database in the existing Prisma Postgres integration. Production and development can share the weekend-test database; preview deployments should use a separate database before being enabled.
2. Set DATABASE_URL, a private STAFF_PIN, and PUBLIC_SITE_URL in Vercel production.
3. Apply the committed migration: `npx prisma migrate deploy` (with DATABASE_URL loaded).
4. Deploy with `vercel --prod` or push to main after database setup. Production builds apply committed database migrations before building. Preview builds do not run migrations and need their own database configuration.

Postgres holds attendees, signatures, staff sessions and login-attempt limits. There is no file-storage fallback on Vercel. Conditional signature updates prevent duplicate simultaneous submissions. Staff cookies are HTTP-only, SameSite=Strict, secure on Vercel, and expire after 12 hours; only hashed session tokens are stored. PIN attempts are limited to 20 per IP per 15 minutes.

## Reset for a new test

Download a backup first if needed. Run `node --env-file=.env.production scripts/clear-data.mjs --confirm-clear` with the intended database configured. This permanently deletes all attendee records and signatures in that database. It does not clear unrelated data or databases.

## Verification

`npm run build` checks TypeScript and builds. `npm test` runs the browser flow against isolated local test data on port 4174 and requires Google Chrome. It covers mobile/desktop, editable confirmation, signing, duplicates, staff access, payment edits, CSV/XLSX import, invalid uploads, walk-ins, print layout, persistence and QR generation. Hosted database and deployment checks must also run before sharing a live link.
