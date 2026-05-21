import { runCore } from "../core/pipeline-core.js";
import type { UvBbox } from "../core/uv-bbox.js";
import { webImageOps } from "./image-canvas.js";
import { webZipOps } from "./zip-fflate.js";
import { readGlbFromBytes, writeGlbToBytes } from "./glb-io.js";

export interface PackOptions {
  /** Stem used for filenames inside the zip. Default: "model". */
  filename?: string;
  /** Whether to produce the zip. Default: true. */
  zip?: boolean;
}

export interface PackResult {
  glbBytes: Uint8Array;
  baseColorPng: Uint8Array;
  asepriteBytes: Uint8Array;
  zipBytes: Uint8Array | null;
  bbox: UvBbox;
  baseColorSize: { width: number; height: number };
}

export async function runPack(
  glbBytes: Uint8Array,
  opts: PackOptions = {},
): Promise<PackResult> {
  const stem = opts.filename ?? "model";
  const wantsZip = opts.zip !== false;

  const doc = await readGlbFromBytes(glbBytes);
  const result = await runCore({ doc, image: webImageOps });
  const outGlbBytes = await writeGlbToBytes(doc);

  let zipBytes: Uint8Array | null = null;
  if (wantsZip) {
    zipBytes = await webZipOps.pack([
      { name: `${stem}.glb`, bytes: outGlbBytes },
      { name: `${stem}.png`, bytes: result.baseColorPng },
      { name: `${stem}.aseprite`, bytes: result.asepriteBytes },
    ]);
  }

  return {
    glbBytes: outGlbBytes,
    baseColorPng: result.baseColorPng,
    asepriteBytes: result.asepriteBytes,
    zipBytes,
    bbox: result.bbox,
    baseColorSize: result.baseColorSize,
  };
}
