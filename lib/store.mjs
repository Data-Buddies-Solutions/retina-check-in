import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const cloud = Boolean(process.env.DATABASE_URL);
if (process.env.VERCEL && !cloud)
  throw new Error("DATABASE_URL is required on Vercel");
const prisma = cloud
  ? new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    })
  : null;
const file =
  process.env.DATA_FILE ||
  path.resolve(import.meta.dirname, "../data/attendees.json");
if (!cloud) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]\n");
}
const read = () => JSON.parse(fs.readFileSync(file, "utf8"));
const save = (rows) => {
  fs.writeFileSync(file + ".tmp", JSON.stringify(rows, null, 2));
  fs.renameSync(file + ".tmp", file);
};
const key = (name) => name.trim().toLowerCase();
const publicRow = ({ nameKey, createdAt, ...row }) => row;
export const failure = (status, message) =>
  Object.assign(new Error(message), { status });
const duplicate = () =>
  failure(
    409,
    "That name is already on the list. Please select it or see the registration desk.",
  );
const alreadySigned = () =>
  failure(
    409,
    "You are already signed in. Please see the registration desk for changes.",
  );

export async function list() {
  return cloud
    ? (
        await prisma.attendee.findMany({
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      ).map(publicRow)
    : read();
}
export async function get(id) {
  const row = cloud
    ? await prisma.attendee.findUnique({ where: { id } })
    : read().find((r) => r.id === id);
  return row ? publicRow(row) : null;
}
export async function sign(id, details, signature) {
  const data = {
    ...details,
    nameKey: key(details.name),
    signature,
    signedAt: new Date(),
    attendeeConfirmedDetails: details,
  };
  if (cloud) {
    try {
      if (!id)
        return publicRow(
          await prisma.attendee.create({ data: { ...data, walkIn: true } }),
        );
      // A conditional update makes simultaneous submissions safe across serverless instances.
      const result = await prisma.attendee.updateMany({
        where: { id, signedAt: null },
        data,
      });
      if (!result.count) throw alreadySigned();
      return get(id);
    } catch (error) {
      if (error.code === "P2002") throw duplicate();
      throw error;
    }
  }
  const rows = read();
  if (rows.some((r) => r.id !== id && key(r.name) === data.nameKey))
    throw duplicate();
  const person = rows.find((r) => r.id === id);
  if (person?.signedAt) throw alreadySigned();
  const signed = publicRow({
    ...(person || { id: randomUUID(), walkIn: true }),
    ...data,
  });
  save(id ? rows.map((r) => (r.id === id ? signed : r)) : [...rows, signed]);
  return signed;
}
export async function update(id, data) {
  if (cloud) return prisma.attendee.update({ where: { id }, data });
  save(read().map((r) => (r.id === id ? { ...r, ...data } : r)));
}
export async function importRows(incoming) {
  if (cloud) {
    const result = await prisma.attendee.createMany({
      data: incoming.map((r) => ({ ...r, nameKey: key(r.name) })),
      skipDuplicates: true,
    });
    return result.count;
  }
  const rows = read(),
    seen = new Set(rows.map((r) => key(r.name))),
    added = [];
  for (const row of incoming)
    if (!seen.has(key(row.name))) {
      added.push(row);
      seen.add(key(row.name));
    }
  save([...rows, ...added]);
  return added.length;
}
const sessions = new Map(),
  attempts = new Map();
export async function createSession(tokenHash, expiresAt) {
  if (cloud)
    await prisma.staffSession.create({ data: { tokenHash, expiresAt } });
  else sessions.set(tokenHash, expiresAt);
}
export async function hasSession(tokenHash) {
  if (!tokenHash) return false;
  const session = cloud
    ? await prisma.staffSession.findUnique({ where: { tokenHash } })
    : { expiresAt: sessions.get(tokenHash) };
  return Boolean(
    session?.expiresAt && new Date(session.expiresAt) > new Date(),
  );
}
export async function deleteSession(tokenHash) {
  if (!tokenHash) return;
  if (cloud) await prisma.staffSession.deleteMany({ where: { tokenHash } });
  else sessions.delete(tokenHash);
}
export async function allowLogin(ipHash) {
  const bucket = Math.floor(Date.now() / 900000),
    attemptKey = `${ipHash}:${bucket}`,
    expiresAt = new Date((bucket + 2) * 900000);
  if (cloud) {
    const result = await prisma.loginAttempt.upsert({
      where: { key: attemptKey },
      create: { key: attemptKey, expiresAt },
      update: { count: { increment: 1 } },
    });
    return result.count <= 20;
  }
  attempts.set(attemptKey, (attempts.get(attemptKey) || 0) + 1);
  return attempts.get(attemptKey) <= 20;
}
export async function clear() {
  if (cloud) await prisma.attendee.deleteMany();
  else save([]);
}
export async function disconnect() {
  await prisma?.$disconnect();
}
