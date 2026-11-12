import { PGlite } from "@electric-sql/pglite";
import type { TransactionDb } from "@/lib/db/client";
import { applySchema } from "@/lib/db/schema";

// A fresh, empty Postgres in memory (PGlite, decision 010) with our schema loaded.
// Nothing is saved to disk and nothing goes over the network.
export async function createTestDb(): Promise<TransactionDb> {
  const pg = new PGlite();
  const db: TransactionDb = {
    async query(text, params = []) {
      const result = await pg.query(text, params);
      return result.rows as never[];
    },
    async transaction(queries) {
      return pg.transaction(async (tx) => {
        const results: Record<string, unknown>[][] = [];
        for (const q of queries) {
          results.push((await tx.query(q.text, q.params ?? [])).rows as never[]);
        }
        return results;
      });
    },
  };
  await applySchema(db);
  return db;
}
