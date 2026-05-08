import { describe, it, expect } from "vitest";
import { computeUvBbox } from "../../src/uv-bbox.js";

describe("computeUvBbox", () => {
  it("returns the rectangle that contains every UV point", () => {
    const uvs = new Float32Array([0.1, 0.2, 0.5, 0.4, 0.3, 0.3]);
    const bbox = computeUvBbox([uvs]);
    expect(bbox.uMin).toBeCloseTo(0.1, 5);
    expect(bbox.vMin).toBeCloseTo(0.2, 5);
    expect(bbox.uMax).toBeCloseTo(0.5, 5);
    expect(bbox.vMax).toBeCloseTo(0.4, 5);
  });

  it("merges UVs from multiple primitives", () => {
    const a = new Float32Array([0.1, 0.5]);
    const b = new Float32Array([0.6, 0.2]);
    const bbox = computeUvBbox([a, b]);
    expect(bbox.uMin).toBeCloseTo(0.1, 5);
    expect(bbox.vMin).toBeCloseTo(0.2, 5);
    expect(bbox.uMax).toBeCloseTo(0.6, 5);
    expect(bbox.vMax).toBeCloseTo(0.5, 5);
  });

  it("handles a single repeated point as a degenerate bbox", () => {
    const uvs = new Float32Array([0.3, 0.3, 0.3, 0.3]);
    const bbox = computeUvBbox([uvs]);
    expect(bbox.uMin).toBeCloseTo(0.3, 5);
    expect(bbox.vMin).toBeCloseTo(0.3, 5);
    expect(bbox.uMax).toBeCloseTo(0.3, 5);
    expect(bbox.vMax).toBeCloseTo(0.3, 5);
  });

  it("includes UVs at exactly 0 and 1", () => {
    const uvs = new Float32Array([0, 0, 1, 1]);
    expect(computeUvBbox([uvs])).toEqual({
      uMin: 0, vMin: 0, uMax: 1, vMax: 1,
    });
  });

  it("throws on empty input (no UVs to bound)", () => {
    expect(() => computeUvBbox([])).toThrow();
  });
});
