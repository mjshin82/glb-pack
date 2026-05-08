import type { Document } from "@gltf-transform/core";
import sharp from "sharp";
import type { UvBbox } from "./core/uv-bbox.js";

export interface CropResult {
  /** PNG bytes of the cropped baseColor texture. */
  baseColorPng: Uint8Array;
  /** Pixel size of the cropped baseColor (matches the bbox). */
  baseColorSize: { width: number; height: number };
}

export async function cropTextures(doc: Document, bbox: UvBbox): Promise<CropResult> {
  const root = doc.getRoot();
  const material = root.listMaterials()[0]; // validate.ts guaranteed exactly one
  if (!material) throw new Error("cropTextures: no material found (validate first).");
  const baseColorTex = material.getBaseColorTexture();
  if (!baseColorTex) throw new Error("cropTextures: no baseColor texture found (validate first).");

  let baseColorPng: Uint8Array | null = null;
  let baseColorSize = { width: 0, height: 0 };

  for (const tex of root.listTextures()) {
    const buf = tex.getImage();
    if (!buf) continue;

    const img = sharp(Buffer.from(buf));
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) {
      throw new Error(`Texture "${tex.getName()}" has no readable dimensions.`);
    }

    const left = Math.max(0, Math.floor(bbox.uMin * w));
    const top = Math.max(0, Math.floor(bbox.vMin * h));
    const right = Math.min(w, Math.ceil(bbox.uMax * w));
    const bottom = Math.min(h, Math.ceil(bbox.vMax * h));
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);

    const cropped = await img.extract({ left, top, width, height }).png().toBuffer();
    const out = new Uint8Array(cropped);
    tex.setImage(out).setMimeType("image/png");

    if (tex === baseColorTex) {
      baseColorPng = out;
      baseColorSize = { width, height };
    }
  }

  if (!baseColorPng) {
    throw new Error("baseColor texture had no image data after crop.");
  }
  return { baseColorPng, baseColorSize };
}
