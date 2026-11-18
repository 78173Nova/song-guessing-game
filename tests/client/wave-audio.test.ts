import { describe, expect, it, vi } from "vitest";
import { createWaveAudio } from "@/lib/client/wave-audio";

// A fake AudioContext that records what was created and connected. No real sound.
function fakeContext(state: "running" | "suspended" = "running") {
  const analyser = { fftSize: 0, smoothingTimeConstant: 0, connect: vi.fn(), disconnect: vi.fn() };
  const sources: { element: unknown; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const context = {
    state,
    destination: { name: "speakers" },
    resume: vi.fn(async () => {}),
    createAnalyser: vi.fn(() => analyser),
    createMediaElementSource: vi.fn((element: unknown) => {
      const source = { element, connect: vi.fn(), disconnect: vi.fn() };
      sources.push(source);
      return source;
    }),
  };
  return { context, analyser, sources, asContext: context as unknown as AudioContext };
}
const player = () => ({ crossOrigin: null as string | null }) as unknown as HTMLAudioElement;

describe("createWaveAudio", () => {
  it("has no analyser until the first tap", () => {
    const fake = fakeContext();
    const make = vi.fn(() => fake.asContext);
    const audio = createWaveAudio(make);
    expect(make).not.toHaveBeenCalled();
    expect(audio.analyser()).toBeNull();
  });

  it("creates the sound context once, inside the tap, and resumes it on every tap", () => {
    const fake = fakeContext();
    const make = vi.fn(() => fake.asContext);
    const audio = createWaveAudio(make);
    audio.unlock();
    audio.unlock();
    expect(make).toHaveBeenCalledTimes(1);
    expect(fake.context.resume).toHaveBeenCalledTimes(2);
    expect(fake.analyser.fftSize).toBe(256); // → 128 frequency bands, as wave-shape expects
    expect(fake.analyser.connect).toHaveBeenCalledWith(fake.context.destination);
  });

  it("asks for cross-origin access on a player only when there is a sound context", () => {
    const fake = fakeContext();
    const audio = createWaveAudio(() => fake.asContext);
    const before = player();
    audio.prepare(before);
    expect(before.crossOrigin).toBeNull(); // no tap yet → the player stays exactly as before
    audio.unlock();
    const after = player();
    audio.prepare(after);
    expect(after.crossOrigin).toBe("anonymous");
  });

  it("routes a prepared player through the analyser to the speakers once", () => {
    const fake = fakeContext();
    const audio = createWaveAudio(() => fake.asContext);
    audio.unlock();
    const p = player();
    audio.prepare(p);
    expect(audio.attach(p)).toBe(true);
    expect(audio.attach(p)).toBe(true);
    expect(fake.context.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(fake.sources[0].connect).toHaveBeenCalledWith(fake.analyser);
    expect(audio.analyser()).toBe(fake.analyser);
  });

  it("leaves the player alone while the sound context is not running (sound keeps playing directly)", () => {
    const fake = fakeContext("suspended");
    const audio = createWaveAudio(() => fake.asContext);
    audio.unlock();
    const p = player();
    audio.prepare(p);
    expect(audio.attach(p)).toBe(false);
    expect(fake.context.createMediaElementSource).not.toHaveBeenCalled();
  });

  it("leaves a player alone that was not prepared for cross-origin access (it would go silent)", () => {
    const fake = fakeContext();
    const audio = createWaveAudio(() => fake.asContext);
    audio.unlock();
    expect(audio.attach(player())).toBe(false);
    expect(fake.context.createMediaElementSource).not.toHaveBeenCalled();
  });

  it("works without the Web Audio API: no analyser, players untouched, no error", () => {
    for (const make of [() => null, () => { throw new Error("not allowed"); }]) {
      const audio = createWaveAudio(make);
      expect(() => audio.unlock()).not.toThrow();
      const p = player();
      audio.prepare(p);
      expect(p.crossOrigin).toBeNull();
      expect(audio.attach(p)).toBe(false);
      expect(audio.analyser()).toBeNull();
    }
  });

  it("does not fail when routing a player throws", () => {
    const fake = fakeContext();
    fake.context.createMediaElementSource.mockImplementation(() => {
      throw new Error("already used");
    });
    const audio = createWaveAudio(() => fake.asContext);
    audio.unlock();
    const p = player();
    audio.prepare(p);
    expect(audio.attach(p)).toBe(false);
  });

  it("disconnects the players of the previous game", () => {
    const fake = fakeContext();
    const audio = createWaveAudio(() => fake.asContext);
    audio.unlock();
    const old = player();
    audio.prepare(old);
    audio.attach(old);
    audio.detachAll();
    expect(fake.sources[0].disconnect).toHaveBeenCalled();
  });

  it("closes the sound context when the game screen goes away, and can start again later", () => {
    const first = fakeContext();
    const second = fakeContext();
    const close = vi.fn(async () => {});
    Object.assign(first.context, { close });
    const make = vi.fn().mockReturnValueOnce(first.asContext).mockReturnValueOnce(second.asContext);
    const audio = createWaveAudio(make);
    audio.close(); // nothing to close yet: no error
    audio.unlock();
    const p = player();
    audio.prepare(p);
    audio.attach(p);
    audio.close();
    expect(close).toHaveBeenCalled();
    expect(first.sources[0].disconnect).toHaveBeenCalled();
    expect(audio.analyser()).toBeNull();
    audio.unlock();
    expect(make).toHaveBeenCalledTimes(2);
  });
});
