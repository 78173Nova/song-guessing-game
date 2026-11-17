"use client";

import { useState } from "react";
import { apiChangeEmail, apiChangePassword, apiChangeUsername } from "@/lib/client/account-api";
import type { ApiResponse } from "@/lib/client/game-api";
import styles from "./Landing.module.css";

type Field = {
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  maxLength: number;
  hint?: string;
};

// One small form on the Account settings page: its fields, a button, and the server's reply below it. The server
// checks every value again; the page only shows what it answers. Password boxes are emptied after each try.
function DetailForm({
  id,
  title,
  fields,
  button,
  send,
}: {
  id: string;
  title: string;
  fields: Field[];
  button: string;
  send: (values: Record<string, string>) => Promise<{ ok: true; message: string } | { ok: false; message: string }>;
}) {
  const empty = Object.fromEntries(fields.map((field) => [field.name, ""]));
  const [values, setValues] = useState<Record<string, string>>(empty);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    setDone("");
    const result = await send(values);
    setSending(false);
    if (result.ok) {
      setDone(result.message);
      setValues(empty);
    } else {
      setError(result.message);
      setValues((old) => ({
        ...old,
        ...Object.fromEntries(fields.filter((f) => f.type === "password").map((f) => [f.name, ""])),
      }));
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.codeLabel}>
        {title}
      </h2>
      {fields.map((field) => (
        <div key={field.name} className={styles.form}>
          <label htmlFor={`${id}-${field.name}`} className={styles.hint}>
            {field.label}
          </label>
          <input
            id={`${id}-${field.name}`}
            className={styles.textInput}
            type={field.type}
            autoComplete={field.autoComplete}
            maxLength={field.maxLength}
            value={values[field.name]}
            onChange={(event) => setValues((old) => ({ ...old, [field.name]: event.target.value }))}
            aria-describedby={field.hint ? `${id}-${field.name}-hint` : undefined}
          />
          {field.hint && (
            <p id={`${id}-${field.name}-hint`} className={styles.hint}>
              {field.hint}
            </p>
          )}
        </div>
      ))}
      <p className={styles.error} role="alert">
        {error}
      </p>
      <p className={styles.hint} role="status">
        {done}
      </p>
      <button type="submit" className={styles.secondary} disabled={sending}>
        {sending ? "Saving…" : button}
      </button>
    </form>
  );
}

// Turns a call's reply into what DetailForm shows.
function shown<T>(result: ApiResponse<T>, message: (data: T) => string) {
  return result.ok ? { ok: true as const, message: message(result.data) } : result;
}

const CURRENT_PASSWORD: Field = {
  name: "password",
  label: "Current password",
  type: "password",
  autoComplete: "current-password",
  maxLength: 128,
};

// Changing the username, email and password of the logged-in account (issue #45). `onRenamed` tells the page the
// new username, so "Logged in as" shows it straight away.
export default function LoginDetailsForms({ onRenamed }: { onRenamed: (username: string) => void }) {
  return (
    <>
      <DetailForm
        id="change-username"
        title="Change username"
        button="Change username"
        fields={[
          {
            name: "username",
            label: "New username",
            type: "text",
            autoComplete: "username",
            maxLength: 20,
            hint: "3–20 characters: letters, digits and _.",
          },
        ]}
        send={async ({ username }) =>
          shown(await apiChangeUsername(username), (data) => {
            onRenamed(data.username);
            return `Your username is now ${data.username}.`;
          })
        }
      />
      <DetailForm
        id="change-email"
        title="Change email"
        button="Change email"
        fields={[
          {
            name: "email",
            label: "New email",
            type: "email",
            autoComplete: "email",
            maxLength: 254,
            hint: "We send a link to the new address; your email changes when you open it.",
          },
          CURRENT_PASSWORD,
        ]}
        send={async ({ email, password }) => shown(await apiChangeEmail({ email, password }), (data) => data.message)}
      />
      <DetailForm
        id="change-password"
        title="Change password"
        button="Change password"
        fields={[
          { ...CURRENT_PASSWORD, name: "currentPassword" },
          {
            name: "newPassword",
            label: "New password",
            type: "password",
            autoComplete: "new-password",
            maxLength: 128,
            hint: "8–128 characters, no spaces. Other browsers are logged out; this one stays logged in.",
          },
        ]}
        send={async ({ currentPassword, newPassword }) =>
          shown(await apiChangePassword({ currentPassword, newPassword }), (data) => data.message)
        }
      />
    </>
  );
}
