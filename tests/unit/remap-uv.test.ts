import { describe, it, expect } from "vitest";
import { remapUv } from "../../src/remap-uv.js";

describe("remapUv", () => {
  it("maps bbox corners to (0,0) and (1,1)", () => {
    const bbox = { uMin: 0.2, vMin: 0.3, uMax: 0.6, vMax: 0.7 };
    const uvs = new Float32Array([0.2, 0.3, 0.6, 0.7]);
    const out = remapUv(uvs, bbox);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(1);
    expect(out[3]).toBeCloseTo(1);
  });

  it("maps interior points proportionally", () => {
    const bbox = { uMin: 0, vMin: 0, uMax: 1, vMax: 1 };
    const uvs = new Float32Array([0.25, 0.75]);
    const out = remapUv(uvs, bbox);
    expect(out[0]).toBeCloseTo(0.25);
    expect(out[1]).toBeCloseTo(0.75);
  });

  it("collapses to (0,0) on a degenerate bbox to avoid div-by-zero", () => {
    const bbox = { uMin: 0.5, vMin: 0.5, uMax: 0.5, vMax: 0.5 };
    const uvs = new Float32Array([0.5, 0.5]);
    const out = remapUv(uvs, bbox);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
  });

  it("returns a new array without mutating the input", () => {
    const bbox = { uMin: 0, vMin: 0, uMax: 1, vMax: 1 };
    const uvs = new Float32Array([0.5, 0.5]);
    const out = remapUv(uvs, bbox);
    expect(out).not.toBe(uvs);
    expect(uvs[0]).toBe(0.5);
  });
});
