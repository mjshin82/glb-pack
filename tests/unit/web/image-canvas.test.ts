// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { webImageOps } from "../../../src/web/image-canvas.js";

describe("webImageOps.decodeRgba", () => {
  it("returns RGBA top-down pixels via the canvas-package fallback", async () => {
    const raw = new Uint8Array([
      255, 0, 0, 255,   255, 0, 0, 255,   255, 0, 0, 255,
      0, 0, 255, 255,   0, 0, 255, 255,   0, 0, 255, 255,
    ]);
    const png = await sharp(raw, { raw: { width: 3, height: 2, channels: 4 } })
      .png()
      .toBuffer();

    const out = await webImageOps.decodeRgba(new Uint8Array(png));
    expect(out.width).toBe(3);
    expect(out.height).toBe(2);
    expect(out.pixels[0]).toBe(255);
    expect(out.pixels[1]).toBe(0);
    expect(out.pixels[2]).toBe(0);
    expect(out.pixels[3 * 4 + 2]).toBe(255); // second row first pixel: blue channel
  });
});
