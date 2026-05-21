export interface AsepriteLayer {
  readonly name: string;
  /** RGBA, top-down, length = width * height * 4. */
  readonly pixels: Uint8Array;
}

/**
 * Build a minimal .aseprite byte stream.
 * - Color mode: RGBA 32-bit
 * - One frame (duration 100ms)
 * - One cel per layer (compressed, zlib stream)
 *
 * Throws RangeError if width/height are not integers in [1, 65535],
 * or if any layer.pixels.length !== width * height * 4.
 */
export function writeAseprite(
  width: number,
  height: number,
  layers: ReadonlyArray<AsepriteLayer>,
): Uint8Array {
  if (!Number.isInteger(width) || width <= 0 || width > 65535) {
    throw new RangeError(`writeAseprite: width must be an integer in [1, 65535], got ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0 || height > 65535) {
    throw new RangeError(`writeAseprite: height must be an integer in [1, 65535], got ${height}`);
  }
  const expected = width * height * 4;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].pixels.length !== expected) {
      throw new RangeError(
        `writeAseprite: layers[${i}].pixels.length=${layers[i].pixels.length}, expected ${expected}`,
      );
    }
  }
  throw new Error("writeAseprite: not implemented");
}
