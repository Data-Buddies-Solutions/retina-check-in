import "dotenv/config";
if (!process.argv.includes("--confirm-clear"))
  throw new Error(
    "Use --confirm-clear to delete all attendees and signatures.",
  );
const store = await import("../lib/store.mjs");
await store.clear();
console.log(
  `Cleared attendees and signatures. Remaining: ${(await store.list()).length}`,
);
await store.disconnect();
