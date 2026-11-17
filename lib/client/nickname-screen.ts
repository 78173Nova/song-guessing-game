// What the nickname screen of a room starts with (issue #44). A guest picks a nickname and an avatar each time,
// with an avatar preselected at random. An account holder gets their usual nickname (else their username) and
// their saved avatar filled in, so one tap enters; one without a saved avatar is asked for it once.
// Editing the values on this screen does not change the saved ones (Account settings does).
import { randomAvatar } from "../game/avatars";
import type { AccountSettings } from "./account-api";

export type NicknameScreenStart = { nickname: string; avatar: string; askAvatar: boolean };

export function nicknameScreenStart(
  account: AccountSettings | null,
  random: () => number = Math.random,
): NicknameScreenStart {
  if (account === null) return { nickname: "", avatar: randomAvatar(random), askAvatar: true };
  return {
    nickname: account.nickname ?? account.username,
    avatar: account.avatar ?? randomAvatar(random),
    askAvatar: account.avatar === null,
  };
}
