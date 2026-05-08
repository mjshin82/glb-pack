/**
 * Image-cropping operations the core pipeline needs from the host environment.
 * Implemented by:
 *   - src/node/image-sharp.ts (sharp-based)
 *   - src/web/image-canvas.ts (Canvas2D-based)
 */
export interface ImageOps {
  /** Read the dimensions of an encoded image (PNG/JPEG bytes). */
  readonly probe: (buf: Uint8Array) => Promise<{ width: number; height: number }>;
  /** Crop the given image to the given pixel rect, return PNG bytes. */
  readonly cropToPng: (
    buf: Uint8Array,
    rect: { left: number; top: number; width: number; height: number },
  ) => Promise<Uint8Array>;
}

/**
 * ZIP packing for adapter wrappers (not used by core).
 * Implemented by:
 *   - src/node/zip-archiver.ts (archiver-based)
 *   - src/web/zip-fflate.ts (fflate-based)
 */
export interface ZipOps {
  readonly pack: (
    files: ReadonlyArray<{ name: string; bytes: Uint8Array }>,
  ) => Promise<Uint8Array>;
}
