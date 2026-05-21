import { describe, it, expect } from "vitest";
import { writeAseprite } from "../../../src/core/aseprite-writer.js";
import Aseprite from "ase-parser";
import { Buffer } from "node:buffer";

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

function parse(bytes: Uint8Array): Aseprite {
  const ase = new Aseprite(Buffer.from(bytes), "in-memory.aseprite");
  ase.parse();
  return ase;
}

function solidRGBA(w: number, h: number, r: number, g: number, b: number, a: number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4 + 0] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a;
  }
  return px;
}

describe("writeAseprite — round-trip with ase-parser", () => {
  it("preserves dimensions and a solid-color layer", () => {
    const px = solidRGBA(4, 4, 255, 0, 0, 255);
    const bytes = writeAseprite(4, 4, [{ name: "baseColor", pixels: px }]);

    const ase = parse(bytes);
    expect(ase.width).toBe(4);
    expect(ase.height).toBe(4);
    expect(ase.frames.length).toBe(1);

    const layers = ase.frames[0].cels;
    expect(layers.length).toBe(1);
    const cel = layers[0];
    expect(cel.w).toBe(4);
    expect(cel.h).toBe(4);
    const decoded = cel.rawCelData ?? (cel as any).rawCel ?? (cel as any).pixels;
    expect(decoded).toBeDefined();
    expect(decoded!.length).toBe(4 * 4 * 4);
    for (let i = 0; i < 4 * 4; i++) {
      expect(decoded![i * 4 + 0]).toBe(255);
      expect(decoded![i * 4 + 1]).toBe(0);
      expect(decoded![i * 4 + 2]).toBe(0);
      expect(decoded![i * 4 + 3]).toBe(255);
    }
  });

  it("preserves a per-pixel pattern byte-for-byte", () => {
    const w = 16, h = 8;
    const px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        px[o + 0] = (x * 16) & 0xff;
        px[o + 1] = (y * 16) & 0xff;
        px[o + 2] = (x ^ y) & 0xff;
        px[o + 3] = 255;
      }
    }
    const bytes = writeAseprite(w, h, [{ name: "L", pixels: px }]);

    const ase = parse(bytes);
    expect(ase.width).toBe(w);
    expect(ase.height).toBe(h);

    const cel = ase.frames[0].cels[0];
    const decoded = cel.rawCelData ?? (cel as any).rawCel ?? (cel as any).pixels;
    expect(decoded).toBeDefined();
    expect(decoded!.length).toBe(px.length);
    for (let i = 0; i < px.length; i++) {
      expect(decoded![i]).toBe(px[i]);
    }
  });

  it("preserves the layer name", () => {
    const px = solidRGBA(2, 2, 1, 2, 3, 4);
    const bytes = writeAseprite(2, 2, [{ name: "baseColor", pixels: px }]);
    const ase = parse(bytes);
    expect(ase.layers.length).toBe(1);
    expect(ase.layers[0].name).toBe("baseColor");
  });
});
