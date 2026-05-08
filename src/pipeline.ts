import { join, basename, extname } from "node:path";
import { Accessor } from "@gltf-transform/core";
import { load } from "./load.js";
import { validate } from "./validate.js";
import { computeUvBbox } from "./uv-bbox.js";
import type { UvBbox } from "./uv-bbox.js";
import { remapUv } from "./remap-uv.js";
import { cropTextures } from "./crop-textures.js";
import { writeGlb } from "./write-glb.js";
import { writePng } from "./write-png.js";
import { packZip } from "./pack-zip.js";

export interface PipelineOptions {
  inputPath: string;
  outputDir: string;
  zip: boolean;
}

export interface PipelineResult {
  bbox: UvBbox;
  baseColorSize: { width: number; height: number };
  outputs: { glb: string; png: string; zip: string | null };
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const stem = basename(opts.inputPath, extname(opts.inputPath));
  const outGlb = join(opts.outputDir, `${stem}.glb`);
  const outPng = join(opts.outputDir, `${stem}.png`);
  const outZip = join(opts.outputDir, `${stem}.zip`);

  const doc = await load(opts.inputPath);
  validate(doc);

  // Collect every unique UV accessor and its underlying Float32Array.
  const accessors = new Set<Accessor>();
  const uvArrays: Float32Array[] = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const acc = prim.getAttribute("TEXCOORD_0");
      if (!acc || accessors.has(acc)) continue;
      accessors.add(acc);
      const arr = acc.getArray();
      if (arr instanceof Float32Array) uvArrays.push(arr);
    }
  }
  const bbox = computeUvBbox(uvArrays);

  const cropResult = await cropTextures(doc, bbox);

  // Remap each unique UV accessor in place.
  for (const acc of accessors) {
    const arr = acc.getArray();
    if (!(arr instanceof Float32Array)) continue;
    acc.setArray(remapUv(arr as Float32Array<ArrayBuffer>, bbox) as Float32Array<ArrayBuffer>);
  }

  await writeGlb(doc, outGlb);
  await writePng(cropResult.baseColorPng, outPng);

  let zipPath: string | null = null;
  if (opts.zip) {
    await packZip([outGlb, outPng], outZip);
    zipPath = outZip;
  }

  return {
    bbox,
    baseColorSize: cropResult.baseColorSize,
    outputs: { glb: outGlb, png: outPng, zip: zipPath },
  };
}
