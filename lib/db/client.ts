import { neon } from "@neondatabase/serverless";

// The one thing every lib/db function needs: a way to run a SQL query with parameters.
// Parameters ($1, $2, ...) are always sent separately from the SQL text, so user input can never change the query.
// The app passes the Neon database (getDb below), the tests pass PGlite (tests/helpers/test-db.ts).
export type Db = {
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<Row[]>;
};

export type Query = { text: string; params?: unknown[] };

// A database that can also run several queries as one transaction: all of them happen or none,
// in the given order, and a lock taken by one query is held until the last one is done.
// Returns the rows of each query. Used for joining a room (decision 012).
export type TransactionDb = Db & {
  transaction(queries: Query[]): Promise<Record<string, unknown>[][]>;
};

// Connects to Neon using DATABASE_URL (never hard-coded, see CLAUDE.md rule 6).
export function getDb(): TransactionDb {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  const sql = neon(url);
  return {
    async query(text, params = []) {
      return (await sql.query(text, params)) as never[];
    },
    async transaction(queries) {
      // "ReadCommitted" (the Postgres default, written out on purpose): each query in the transaction sees
      // what others have saved up to that moment. addPlayer relies on this to count after taking the lock.
      return (await sql.transaction(
        queries.map((q) => sql.query(q.text, q.params ?? [])),
        { isolationLevel: "ReadCommitted" },
      )) as never[];
    },
  };
}
