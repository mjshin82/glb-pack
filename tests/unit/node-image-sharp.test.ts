import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { nodeImageOps } from "../../src/node/image-sharp.js";

describe("nodeImageOps.decodeRgba", () => {
  it("returns RGBA top-down pixels with matching dimensions", async () => {
    // Build a 3×2 PNG: row 0 red, row 1 blue (top-down).
    const raw = new Uint8Array([
      255, 0, 0, 255,   255, 0, 0, 255,   255, 0, 0, 255,
      0, 0, 255, 255,   0, 0, 255, 255,   0, 0, 255, 255,
    ]);
    const png = await sharp(raw, { raw: { width: 3, height: 2, channels: 4 } })
      .png()
      .toBuffer();

    const out = await nodeImageOps.decodeRgba(new Uint8Array(png));
    expect(out.width).toBe(3);
    expect(out.height).toBe(2);
    expect(out.pixels.length).toBe(3 * 2 * 4);
    // Top row red
    expect(out.pixels[0]).toBe(255);
    expect(out.pixels[1]).toBe(0);
    expect(out.pixels[2]).toBe(0);
    expect(out.pixels[3]).toBe(255);
    // Second-row first pixel blue
    expect(out.pixels[3 * 4 + 0]).toBe(0);
    expect(out.pixels[3 * 4 + 1]).toBe(0);
    expect(out.pixels[3 * 4 + 2]).toBe(255);
    expect(out.pixels[3 * 4 + 3]).toBe(255);
  });
});
