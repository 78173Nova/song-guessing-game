// Avatars (issue #44): every player shows one picture next to their nickname, picked from this fixed set.
// No uploads. The server stores and sends the id (e.g. "fox"); the page shows the emoji, so no images and no
// extra package are needed. Two players in a room may have the same avatar.
export const AVATARS = [
  { id: "fox", emoji: "🦊", label: "Fox" },
  { id: "cat", emoji: "🐱", label: "Cat" },
  { id: "dog", emoji: "🐶", label: "Dog" },
  { id: "owl", emoji: "🦉", label: "Owl" },
  { id: "panda", emoji: "🐼", label: "Panda" },
  { id: "frog", emoji: "🐸", label: "Frog" },
  { id: "lion", emoji: "🦁", label: "Lion" },
  { id: "penguin", emoji: "🐧", label: "Penguin" },
  { id: "octopus", emoji: "🐙", label: "Octopus" },
  { id: "unicorn", emoji: "🦄", label: "Unicorn" },
  { id: "rocket", emoji: "🚀", label: "Rocket" },
  { id: "guitar", emoji: "🎸", label: "Guitar" },
  { id: "headphones", emoji: "🎧", label: "Headphones" },
  { id: "microphone", emoji: "🎤", label: "Microphone" },
  { id: "star", emoji: "⭐", label: "Star" },
  { id: "note", emoji: "🎵", label: "Music note" },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];

// The avatar a player gets when a request names none (older pages, or a test): the music note.
export const DEFAULT_AVATAR: AvatarId = "note";

// Is this one of the fixed avatars? Anything else (unknown names, emoji, upper case, other types) is not.
export function isAvatar(value: unknown): value is AvatarId {
  return typeof value === "string" && AVATARS.some((avatar) => avatar.id === value);
}

// The emoji to show for an avatar id; the default one for an id the page does not know.
export function avatarEmoji(id: string | null | undefined): string {
  return (AVATARS.find((avatar) => avatar.id === id) ?? AVATARS.find((a) => a.id === DEFAULT_AVATAR)!).emoji;
}

// A random avatar, to preselect for a guest. `random` returns a number in [0, 1) like Math.random.
export function randomAvatar(random: () => number = Math.random): AvatarId {
  return AVATARS[Math.min(AVATARS.length - 1, Math.floor(random() * AVATARS.length))].id;
}
