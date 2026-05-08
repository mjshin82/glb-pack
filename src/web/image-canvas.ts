// src/web/image-canvas.ts
import type { ImageOps } from "../ports.js";

async function loadImage(buf: Uint8Array): Promise<HTMLImageElement> {
  const blob = new Blob([buf as unknown as BlobPart]);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("webImageOps: failed to decode image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const webImageOps: ImageOps = {
  async probe(buf) {
    const img = await loadImage(buf);
    return { width: img.naturalWidth, height: img.naturalHeight };
  },

  async cropToPng(buf, rect) {
    const img = await loadImage(buf);
    const canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("webImageOps.cropToPng: 2d context unavailable");
    ctx.drawImage(
      img,
      rect.left, rect.top, rect.width, rect.height,
      0, 0, rect.width, rect.height,
    );
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (!b) reject(new Error("webImageOps.cropToPng: toBlob returned null"));
        else resolve(b);
      }, "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  },
};
