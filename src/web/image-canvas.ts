// src/web/image-canvas.ts
import type { ImageOps } from "../ports.js";

type Rect = { left: number; top: number; width: number; height: number };

// ---------------------------------------------------------------------------
// Native browser path (used in real browser environments)
// ---------------------------------------------------------------------------

async function loadImageNative(buf: Uint8Array): Promise<HTMLImageElement> {
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

// ---------------------------------------------------------------------------
// canvas-package fallback (used in Node.js / test environments where
// happy-dom's HTMLCanvasElement.getContext("2d") returns null)
// ---------------------------------------------------------------------------

type CanvasPkg = typeof import("canvas");
let _canvasPkg: CanvasPkg | null | undefined = undefined; // undefined = not yet tried

async function tryLoadCanvasPkg(): Promise<CanvasPkg | null> {
  if (_canvasPkg !== undefined) return _canvasPkg;
  try {
    _canvasPkg = (await import("canvas")) as CanvasPkg;
  } catch {
    _canvasPkg = null;
  }
  return _canvasPkg;
}

/** Returns true when the native browser canvas 2D context is available. */
function hasNativeCanvas(): boolean {
  if (typeof document === "undefined") return false;
  const testCanvas = document.createElement("canvas");
  return testCanvas.getContext("2d") !== null;
}

async function probeImpl(buf: Uint8Array): Promise<{ width: number; height: number }> {
  if (hasNativeCanvas()) {
    const img = await loadImageNative(buf);
    return { width: img.naturalWidth, height: img.naturalHeight };
  }
  const pkg = await tryLoadCanvasPkg();
  if (!pkg) throw new Error("webImageOps.probe: no canvas implementation available");
  const img = await pkg.loadImage(Buffer.from(buf));
  return { width: img.width, height: img.height };
}

async function cropToPngImpl(buf: Uint8Array, rect: Rect): Promise<Uint8Array> {
  if (hasNativeCanvas()) {
    const img = await loadImageNative(buf);
    const canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("webImageOps.cropToPng: 2d context unavailable");
    ctx.drawImage(
      img as unknown as CanvasImageSource,
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
  }
  // Fallback: use the canvas npm package
  const pkg = await tryLoadCanvasPkg();
  if (!pkg) throw new Error("webImageOps.cropToPng: no canvas implementation available");
  const img = await pkg.loadImage(Buffer.from(buf));
  const canvas = pkg.createCanvas(rect.width, rect.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    img,
    rect.left, rect.top, rect.width, rect.height,
    0, 0, rect.width, rect.height,
  );
  return canvas.toBuffer("image/png");
}

export const webImageOps: ImageOps = {
  probe: probeImpl,
  cropToPng: cropToPngImpl,
};
