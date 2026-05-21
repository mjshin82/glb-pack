import { describe, it, expect } from "vitest";
import { writeAseprite } from "../../../src/core/aseprite-writer.js";

describe("writeAseprite — input validation", () => {
  it("throws RangeError on width=0", () => {
    expect(() => writeAseprite(0, 4, [{ name: "L", pixels: new Uint8Array(0) }]))
      .toThrow(RangeError);
  });

  it("throws RangeError on width > 65535", () => {
    expect(() => writeAseprite(70000, 4, [{ name: "L", pixels: new Uint8Array(70000 * 4 * 4) }]))
      .toThrow(RangeError);
  });

  it("throws RangeError on height=0", () => {
    expect(() => writeAseprite(4, 0, [{ name: "L", pixels: new Uint8Array(0) }]))
      .toThrow(RangeError);
  });

  it("throws RangeError when pixels length mismatches width*height*4", () => {
    expect(() => writeAseprite(2, 2, [{ name: "L", pixels: new Uint8Array(8) }]))
      .toThrow(RangeError);
  });
});
