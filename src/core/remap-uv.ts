import type { UvBbox } from "./uv-bbox.js";

export function remapUv(uvs: Float32Array, bbox: UvBbox): Float32Array {
  const du = bbox.uMax - bbox.uMin;
  const dv = bbox.vMax - bbox.vMin;
  const out = new Float32Array(uvs.length);

  for (let i = 0; i + 1 < uvs.length; i += 2) {
    out[i]     = du === 0 ? 0 : (uvs[i]     - bbox.uMin) / du;
    out[i + 1] = dv === 0 ? 0 : (uvs[i + 1] - bbox.vMin) / dv;
  }
  return out;
}
