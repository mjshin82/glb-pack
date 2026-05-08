import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import { webZipOps } from "../../../src/web/zip-fflate.js";

describe("webZipOps", () => {
  it("packs a list of files into a zip that round-trips", async () => {
    const a = new TextEncoder().encode("hello");
    const b = new TextEncoder().encode("world");
    const zipped = await webZipOps.pack([
      { name: "a.txt", bytes: a },
      { name: "b.txt", bytes: b },
    ]);
    expect(zipped.length).toBeGreaterThan(0);

    const unzipped = unzipSync(zipped);
    expect(new TextDecoder().decode(unzipped["a.txt"])).toBe("hello");
    expect(new TextDecoder().decode(unzipped["b.txt"])).toBe("world");
  });

  it("handles an empty file list (produces a valid empty zip)", async () => {
    const zipped = await webZipOps.pack([]);
    expect(zipped.length).toBeGreaterThan(0);
    expect(unzipSync(zipped)).toEqual({});
  });
});
