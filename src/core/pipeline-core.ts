import { Accessor } from "@gltf-transform/core";
import type { Document } from "@gltf-transform/core";
import { validate } from "./validate.js";
import { computeUvBbox } from "./uv-bbox.js";
import type { UvBbox } from "./uv-bbox.js";
import { remapUv } from "./remap-uv.js";
import { bboxToPixelRect } from "./bbox-to-rect.js";
import type { ImageOps } from "../ports.js";

export interface CoreInputs {
  /** Pre-loaded glTF Document. The adapter handles read; runCore mutates this in place. */
  doc: Document;
  /** Environment-specific image cropping. */
  image: ImageOps;
}

export interface CoreResult {
  /** The cropped baseColor texture as PNG bytes (separately surfaced for adapters that emit a standalone PNG). */
  baseColorPng: Uint8Array;
  /** UV bounding box that was computed and used for cropping/remapping. */
  bbox: UvBbox;
  /** Pixel size of the cropped baseColor texture. */
  baseColorSize: { width: number; height: number };
}

export async function runCore({ doc, image }: CoreInputs): Promise<CoreResult> {
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

  // Crop every texture in place.
  const root = doc.getRoot();
  const material = root.listMaterials()[0];
  if (!material) {
    throw new Error("runCore: no material (validate should have caught).");
  }
  const baseColorTex = material.getBaseColorTexture();
  if (!baseColorTex) {
    throw new Error("runCore: no baseColor texture (validate should have caught).");
  }

  let baseColorPng: Uint8Array | null = null;
  let baseColorSize = { width: 0, height: 0 };

  for (const tex of root.listTextures()) {
    const buf = tex.getImage();
    if (!buf) continue;
    const size = await image.probe(buf);
    const rect = bboxToPixelRect(bbox, size);
    const cropped = await image.cropToPng(buf, rect);
    tex.setImage(cropped).setMimeType("image/png");
    if (tex === baseColorTex) {
      baseColorPng = cropped;
      baseColorSize = { width: rect.width, height: rect.height };
    }
  }
  if (!baseColorPng) {
    throw new Error("runCore: baseColor texture had no image data after crop.");
  }

  // Remap each unique UV accessor in place.
  for (const acc of accessors) {
    const arr = acc.getArray();
    if (!(arr instanceof Float32Array)) continue;
    acc.setArray(
      remapUv(arr as Float32Array<ArrayBuffer>, bbox) as Float32Array<ArrayBuffer>,
    );
  }

  return { baseColorPng, bbox, baseColorSize };
}
