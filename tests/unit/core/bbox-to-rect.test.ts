import { describe, it, expect } from "vitest";
import { bboxToPixelRect } from "../../../src/core/bbox-to-rect.js";

describe("bboxToPixelRect", () => {
  it("maps a unit bbox to the full image rect", () => {
    expect(
      bboxToPixelRect(
        { uMin: 0, vMin: 0, uMax: 1, vMax: 1 },
        { width: 1024, height: 1024 },
      ),
    ).toEqual({ left: 0, top: 0, width: 1024, height: 1024 });
  });

  it("maps a centered quarter bbox proportionally", () => {
    expect(
      bboxToPixelRect(
        { uMin: 0.25, vMin: 0.25, uMax: 0.75, vMax: 0.75 },
        { width: 1024, height: 1024 },
      ),
    ).toEqual({ left: 256, top: 256, width: 512, height: 512 });
  });

  it("uses outward rounding (floor min, ceil max) when edges are mid-pixel", () => {
    // 0.105 * 100 = 10.5 → floor = 10
    // 0.895 * 100 = 89.5 → ceil  = 90
    expect(
      bboxToPixelRect(
        { uMin: 0.105, vMin: 0.105, uMax: 0.895, vMax: 0.895 },
        { width: 100, height: 100 },
      ),
    ).toEqual({ left: 10, top: 10, width: 80, height: 80 });
  });

  it("clamps to the image bounds when bbox slightly exceeds [0,1]", () => {
    expect(
      bboxToPixelRect(
        { uMin: -1e-7, vMin: -1e-7, uMax: 1 + 1e-7, vMax: 1 + 1e-7 },
        { width: 100, height: 100 },
      ),
    ).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });

  it("yields a 1x1 rect for a fully degenerate (zero-area) bbox", () => {
    const r = bboxToPixelRect(
      { uMin: 0.5, vMin: 0.5, uMax: 0.5, vMax: 0.5 },
      { width: 100, height: 100 },
    );
    expect(r).toEqual({ left: 50, top: 50, width: 1, height: 1 });
  });
});
