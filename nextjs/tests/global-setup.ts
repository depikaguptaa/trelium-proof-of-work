import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

// Tests run on the SQLite fallback schema (Postgres needs Docker, which
// is not always available). DATABASE_URL must point at the test file
// before the Prisma client is first created, so set it here and in
// each DB test file.
export default function globalSetup() {
  const dbPath = path.join(process.cwd(), "prisma", "trelium-test.db");
  rmSync(dbPath, { force: true });
  process.env.DATABASE_URL = "file:./trelium-test.db";
  execSync("npx prisma db push --schema prisma/schema.sqlite.prisma --skip-generate", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./trelium-test.db" },
  });
}
