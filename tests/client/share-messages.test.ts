import { describe, expect, it } from "vitest";
import { COPY_FAILED_MESSAGE, LINK_COPIED_MESSAGE, copyLink, copyMessage } from "@/lib/client/share";

// After "Copy link" the share pop-up shows a short message (issue #62): what it says and whether it is a
// success or an error message comes from copyMessage.
describe("copyMessage", () => {
  it("says the link was copied when copying worked", async () => {
    const result = await copyLink("https://songs.example.com/join/482913", { writeText: async () => {} });
    expect(copyMessage(result)).toEqual({ kind: "success", text: LINK_COPIED_MESSAGE });
    expect(LINK_COPIED_MESSAGE).toBe("Link copied");
  });

  it("gives an error message with the hand-copy hint when the browser refuses", async () => {
    const result = await copyLink("https://songs.example.com/join/482913", {
      writeText: async () => {
        throw new Error("denied");
      },
    });
    expect(copyMessage(result)).toEqual({ kind: "error", text: COPY_FAILED_MESSAGE });
  });

  it("gives the same error message when the page has no clipboard at all", async () => {
    const result = await copyLink("https://songs.example.com/join/482913", undefined);
    expect(copyMessage(result)).toEqual({ kind: "error", text: COPY_FAILED_MESSAGE });
  });

  it("passes on any other failure text unchanged", () => {
    expect(copyMessage({ ok: false, message: "Something else" })).toEqual({ kind: "error", text: "Something else" });
  });
});
