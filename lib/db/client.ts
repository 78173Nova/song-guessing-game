import { neon } from "@neondatabase/serverless";

// The one thing every lib/db function needs: a way to run a SQL query with parameters.
// Parameters ($1, $2, ...) are always sent separately from the SQL text, so user input can never change the query.
// The app passes the Neon database (getDb below), the tests pass PGlite (tests/helpers/test-db.ts).
export type Db = {
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<Row[]>;
};

// Connects to Neon using DATABASE_URL (never hard-coded, see CLAUDE.md rule 6).
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  const sql = neon(url);
  return {
    async query(text, params = []) {
      return (await sql.query(text, params)) as never[];
    },
  };
}
