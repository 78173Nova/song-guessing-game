import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Folder rules from CLAUDE.md ("Folder structure"), checked by `npm run lint` instead of only written down.
// Each rule is set once per folder below; when two blocks match a file, the later block wins, so every
// later block repeats what it needs from the earlier ones.

// An import of lib/<name>, written as "@/lib/<name>/..." or as a relative path like "../<name>/...".
const folder = (name, message) => ({ regex: `^(@/lib/|(\\.\\./)+(lib/)?)${name}(/|$)`, message });

const neonImport = {
  name: "@neondatabase/serverless",
  message: "Only lib/db talks to the database. Call a function from lib/db instead.",
};
const dbImport = folder("db", "This folder must not use the database (CLAUDE.md, Folder structure).");
const apiImport = folder("api", "lib/api is server code. Call the server route through lib/client instead.");
const musicImport = folder("music", "This folder must not call iTunes. Only lib/music does, called from the server.");
const emailImport = folder("email", "This folder must not send emails. Only lib/email does, called from the server.");
const clientImport = folder("client", "Game and account rules do not depend on browser code.");

const sqlCall = {
  selector: "CallExpression[callee.property.name=/^(query|transaction)$/]",
  message: "SQL runs only in lib/db. Add a function there and call it.",
};
const fetchCall = {
  selector: "CallExpression[callee.name='fetch']",
  message: "On the server, only lib/music (iTunes) and lib/email (Brevo) go online. Call them instead.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Everywhere: the database only through lib/db. Tests build their own database (tests/helpers/test-db.ts).
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["lib/db/**", "tests/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: [neonImport] }],
      "no-restricted-syntax": ["error", sqlCall],
    },
  },
  // Game and account rules: no database, no network, no browser code – easy to test.
  {
    files: ["lib/game/**", "lib/accounts/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [neonImport], patterns: [dbImport, apiImport, musicImport, emailImport, clientImport] },
      ],
      "no-restricted-syntax": ["error", sqlCall, fetchCall],
    },
  },
  // Server steps and database code: they go online only through lib/music and lib/email.
  {
    files: ["lib/api/**"],
    rules: { "no-restricted-syntax": ["error", sqlCall, fetchCall] },
  },
  {
    files: ["lib/db/**"],
    rules: { "no-restricted-syntax": ["error", fetchCall] },
  },
  // Browser code: it talks to the server routes, never to the database, iTunes or the email sender directly.
  {
    files: ["components/**", "lib/client/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [neonImport], patterns: [dbImport, apiImport, musicImport, emailImport] },
      ],
    },
  },
]);

export default eslintConfig;
