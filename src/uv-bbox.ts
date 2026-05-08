export interface UvBbox {
  uMin: number;
  vMin: number;
  uMax: number;
  vMax: number;
}

export function computeUvBbox(uvArrays: Float32Array[]): UvBbox {
  let uMin = Infinity, vMin = Infinity;
  let uMax = -Infinity, vMax = -Infinity;
  let seenAny = false;

  for (const uvs of uvArrays) {
    for (let i = 0; i + 1 < uvs.length; i += 2) {
      const u = uvs[i];
      const v = uvs[i + 1];
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
      seenAny = true;
    }
  }

  if (!seenAny) throw new Error("computeUvBbox: no UVs provided");
  return { uMin, vMin, uMax, vMax };
}
