import type { UvBbox } from "./uv-bbox.js";

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function bboxToPixelRect(
  bbox: UvBbox,
  size: { width: number; height: number },
): PixelRect {
  const left = Math.max(0, Math.floor(bbox.uMin * size.width));
  const top = Math.max(0, Math.floor(bbox.vMin * size.height));
  const right = Math.min(size.width, Math.ceil(bbox.uMax * size.width));
  const bottom = Math.min(size.height, Math.ceil(bbox.vMax * size.height));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
