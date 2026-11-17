// The room code box on the landing page. The server still checks the code when the room is opened;
// this only catches typos before leaving the page.

// Shown wherever a room code is rejected, so the wording stays the same everywhere.
export const ROOM_CODE_RULE = "Room codes are 6 digits and never start with 0";

// The cleaned room code, or null when the input is not one.
export function parseRoomCode(input: string): string | null {
  const code = input.trim();
  // 6 digits, never starting with 0 – the same format the server gives rooms (spec 002)
  return /^[1-9][0-9]{5}$/.test(code) ? code : null;
}
