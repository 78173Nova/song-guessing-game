import { readFileSync } from "node:fs";
import type { Db } from "./client";

// Creates the tables from db/schema.sql. Safe to run again: every statement uses "IF NOT EXISTS".
// The Neon driver runs one statement per call, so the file is split at semicolons
// (comment lines are removed first).
export async function applySchema(db: Db): Promise<void> {
  const file = readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8");
  const withoutComments = file
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s !== "");

  for (const statement of statements) {
    await db.query(statement);
  }
}
