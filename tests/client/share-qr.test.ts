import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { roomJoinQrCode } from "@/lib/client/share";

// The QR code in the share pop-up (issue #42). It is drawn on the device itself, without any outside service.
// Its picture is an SVG image as a data: address, so the pop-up can show it with a plain <img>.
function svgOf(dataUrl: string): string {
  const prefix = "data:image/svg+xml;charset=utf-8,";
  expect(dataUrl.startsWith(prefix)).toBe(true);
  return decodeURIComponent(dataUrl.slice(prefix.length));
}

describe("roomJoinQrCode", () => {
  it("draws the QR code of the room's join link as an SVG image", async () => {
    const svg = svgOf(await roomJoinQrCode("https://songs.example.com", "482913"));
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    // Same picture as the qrcode package draws for the full join link, written out by hand here.
    const expected = await QRCode.toString("https://songs.example.com/join/482913", { type: "svg", margin: 2 });
    expect(svg).toBe(expected);
  });

  it("uses the same link as the 'Copy link' text, also when the address ends with a slash", async () => {
    const withSlash = await roomJoinQrCode("http://localhost:3000/", "482913");
    const withoutSlash = await roomJoinQrCode("http://localhost:3000", "482913");
    expect(withSlash).toBe(withoutSlash);
  });

  it("gives each room its own QR code", async () => {
    const first = await roomJoinQrCode("https://songs.example.com", "482913");
    const second = await roomJoinQrCode("https://songs.example.com", "482914");
    expect(first).not.toBe(second);
  });
});
