import { PrismaClient } from "@prisma/client";

// Lazy singleton, so tests can set DATABASE_URL before first use.
let client: PrismaClient | null = null;

export function getDb(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}
