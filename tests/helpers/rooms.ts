import { DEFAULT_ROOM_SETTINGS } from "@/lib/game/room-settings";

// "Create a room" needs settings (issue #34). Tests that are not about the settings use the default ones: this adds
// them to a request body that names none. Anything else (not an object, or settings already given) stays as it is.
export function withDefaultSettings(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body) || "settings" in body) return body;
  return { ...body, settings: DEFAULT_ROOM_SETTINGS };
}
