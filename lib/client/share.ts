// The share pop-up of a room (issue #35): the join link, opening the pop-up once after creating a room,
// and copying the link. The address of the site comes from the server's settings (appUrl in lib/email/messages.ts),
// never from the request's Host header, which an attacker can fake.

// The link friends open to join, e.g. https://…/join/482913
export function roomJoinLink(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/join/${encodeURIComponent(code)}`;
}

// The part of the browser's sessionStorage used here, so tests can pass a stand-in.
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// The pop-up opens by itself only for the room creator, right after creating the room. The "create" page leaves
// a mark in this tab's sessionStorage; the lobby takes it away when it opens the pop-up, so a reload does not
// open it again. Storage can be blocked (private mode), so every access is guarded: the pop-up then stays
// closed and can still be opened with the Share button.
const arrivalKey = (code: string) => `room-share-${code}`;
const browserStorage = (): KeyValueStorage => sessionStorage;

export function markShareOnArrival(code: string, storage?: KeyValueStorage) {
  try {
    (storage ?? browserStorage()).setItem(arrivalKey(code), "1");
  } catch {
    // no mark: the pop-up stays closed until the Share button is pressed
  }
}

// true once after markShareOnArrival for this room, then false.
export function takeShareOnArrival(code: string, storage?: KeyValueStorage): boolean {
  try {
    const store = storage ?? browserStorage();
    if (store.getItem(arrivalKey(code)) === null) return false;
    store.removeItem(arrivalKey(code));
    return true;
  } catch {
    return false;
  }
}

export const COPY_FAILED_MESSAGE = "Could not copy the link. Select it above and copy it by hand.";

// "Copy link". The page passes navigator.clipboard, which is missing on pages not served over https and can
// refuse to write; both cases give a message instead of an error.
export async function copyLink(
  link: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    if (!clipboard) return { ok: false, message: COPY_FAILED_MESSAGE };
    await clipboard.writeText(link);
    return { ok: true };
  } catch {
    return { ok: false, message: COPY_FAILED_MESSAGE };
  }
}
