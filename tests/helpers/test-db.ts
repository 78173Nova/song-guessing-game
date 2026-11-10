import { PGlite } from "@electric-sql/pglite";
import type { Db } from "@/lib/db/client";
import { applySchema } from "@/lib/db/schema";

// A fresh, empty Postgres in memory (PGlite, decision 010) with our schema loaded.
// Nothing is saved to disk and nothing goes over the network.
export async function createTestDb(): Promise<Db> {
  const pg = new PGlite();
  const db: Db = {
    async query(text, params = []) {
      const result = await pg.query(text, params);
      return result.rows as never[];
    },
  };
  await applySchema(db);
  return db;
}
