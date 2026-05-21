# glb-pack — Aseprite Output (.aseprite alongside .png)

**Date:** 2026-05-21
**Status:** Design approved
**Target version:** 0.3.0

## Purpose

Add a new output artifact: the cropped baseColor texture written as a minimal `.aseprite` file, in addition to the existing PNG. Users who edit textures in Aseprite get a native-format file they can open and modify directly, without losing the existing PNG-based workflow.

Scope is limited to a single layer holding the cropped baseColor — the same pixels the current PNG output contains. Multi-layer (PBR slots as separate layers) is explicitly **out of scope** for this iteration but the API is shaped so that future extension is additive.

## Key Decisions (Approved)

1. **Additive output, not replacement.** Existing PNG output is preserved unchanged. The `.aseprite` file is written alongside, and is included in the zip when zip output is enabled. No new CLI flag — the file is always produced (cost is small and the artifact is harmless if unused).
2. **Single layer, single frame, RGBA 32-bit.** Layer name: `baseColor`. Frame duration: 100ms. This matches what the PNG output represents.
3. **Pure-JS writer, written in this repo.** No npm package supports writing `.aseprite` files; all existing libraries are read-only. The writer is implemented in `src/core/aseprite-writer.ts` as a pure module reused by both Node and Web adapters.
4. **Both environments supported.** Node CLI writes `outputs/<name>.aseprite`; web `runPack()` returns `asepriteBytes: Uint8Array`. Same writer code path on both sides.
5. **fflate for zlib compression.** Already a runtime dependency in the web build. The writer uses `deflateSync` and wraps the output with the zlib header (`0x78 0x9C`) and a manual Adler32 trailer, matching the C# reference implementation we ported from.
6. **Pixel decode through `ImageOps`.** A new `decodeRgba` method on the existing `ImageOps` port returns top-down RGBA bytes. Node adapter uses `sharp.raw()`; web adapter uses Canvas2D `getImageData`.

## Reference

A minimal C# writer in a separate Unity project served as a verified reference for the binary layout:

```
/Users/oracle/Documents/concode/x2/Assets/ThirdParty.Editor/AseImporter/Aseprite/AseFileWriter.cs
```

The TS implementation ports the same field order, magic numbers, and zlib wrapping. The only behavioral difference: this codebase's PNG-decode result is already top-down, so the C# reference's pixel row flip (needed for Unity's bottom-up `Color32[]`) is omitted.

## File Structure Changes

```
src/
├─ core/
│  ├─ aseprite-writer.ts        # NEW. Pure: (w, h, layers) → Uint8Array
│  └─ pipeline-core.ts          # MODIFIED. Emits asepriteBytes alongside baseColorPng.
│
├─ ports.ts                     # MODIFIED. ImageOps gains decodeRgba.
│
├─ node/
│  ├─ image-sharp.ts            # MODIFIED. Implements decodeRgba via sharp.raw().
│  └─ pipeline.ts               # MODIFIED. Writes <name>.aseprite, includes in zip.
│
├─ web/
│  ├─ image-canvas.ts           # MODIFIED. Implements decodeRgba via getImageData.
│  └─ pipeline.ts               # MODIFIED. Returns asepriteBytes, includes in zip.
│
└─ cli.ts                       # MODIFIED. Logs "✓ Wrote outputs/<name>.aseprite".

tests/
├─ unit/aseprite-writer.test.ts # NEW. Round-trip with ase-parser.
└─ integration/                 # MODIFIED. Asserts .aseprite output + zip entry.
```

## Public API Changes

### `core/aseprite-writer.ts`

```ts
export interface AsepriteLayer {
  readonly name: string;
  /** RGBA, top-down, length = width * height * 4. */
  readonly pixels: Uint8Array;
}

/**
 * Build a minimal .aseprite byte stream.
 * - Color mode: RGBA 32-bit
 * - One frame (duration 100ms)
 * - One cel per layer (compressed, type 2)
 *
 * Throws RangeError if width/height ≤ 0 or > 65535,
 * or if any layer.pixels.length !== width * height * 4.
 */
export function writeAseprite(
  width: number,
  height: number,
  layers: ReadonlyArray<AsepriteLayer>,
): Uint8Array;
```

A-scope use:

```ts
writeAseprite(w, h, [{ name: "baseColor", pixels: rgba }]);
```

### `ports.ts` — `ImageOps` extension

```ts
export interface ImageOps {
  readonly probe: (buf: Uint8Array) => Promise<{ width: number; height: number }>;
  readonly cropToPng: (
    buf: Uint8Array,
    rect: { left: number; top: number; width: number; height: number },
  ) => Promise<Uint8Array>;
  /** Decode encoded image bytes (PNG/JPEG) to raw RGBA, top-down. */
  readonly decodeRgba: (
    buf: Uint8Array,
  ) => Promise<{ width: number; height: number; pixels: Uint8Array }>;
}
```

### `pipeline-core` result

Before:

```ts
{ glbBytes, baseColorPng, bbox, baseColorSize }
```

After:

```ts
{ glbBytes, baseColorPng, asepriteBytes, bbox, baseColorSize }
```

The pipeline calls `image.decodeRgba(baseColorPng)` after the crop step and feeds the result into `writeAseprite`.

### Node `runPipeline` outputs

```ts
{
  outputs: {
    glb: string;
    png: string;
    aseprite: string;        // NEW
    zip: string | null;
  },
  bbox, baseColorSize
}
```

CLI stdout gains one line:

```
✓ Wrote outputs/<name>.aseprite
```

### Web `runPack` result

```ts
{
  glbBytes: Uint8Array;
  baseColorPng: Uint8Array;
  asepriteBytes: Uint8Array;    // NEW
  zipBytes: Uint8Array | null;  // zip includes glb + png + aseprite
  bbox: { uMin, vMin, uMax, vMax };
  baseColorSize: { width, height };
}
```

## File Format (bytes written)

The writer produces a minimal valid `.aseprite` file. Layout matches Aseprite's [file specification](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md) and the referenced C# writer.

| Region | Size | Contents |
|---|---|---|
| Header | 128 B | file size (u32, backfilled), magic `0xA5E0`, frames=1, width, height, color depth=32, flags=1, speed=100, two reserved u32s, transparent index=0, 3 B reserved, num colors=0, pixel w/h=1, 92 B reserved |
| Frame header | 16 B | frame size (u32, backfilled), magic `0xF1FA`, old chunk count (u16, clamped), duration=100, 2 B reserved, new chunk count (u32) |
| Layer chunk | 6 + 18 + name | chunk size, type `0x2004`, flags `0b11` (visible + editable), child level=0, default w/h=0, blend mode=0, opacity, 3 B reserved, name length, UTF-8 name |
| Cel chunk | 6 + 16 + 10 + payload | chunk size, type `0x2005`, layer index, x=0, y=0, opacity=255, cel type=2 (compressed), 7 B reserved, cel width, cel height, zlib stream |
| Zlib stream | — | CMF=`0x78`, FLG=`0x9C`, raw deflate of RGBA pixels, big-endian Adler32 of the uncompressed pixels |

File size and frame size fields are backfilled after writing the rest of the structure (mirrors the reference implementation).

Adler32 is implemented inline (~5 lines, modulo 65521).

## Pixel Conventions

- **Channel order:** RGBA, 4 bytes per pixel.
- **Row order:** top-down. PNG decode via `sharp.raw()` and Canvas `getImageData()` both return top-down rows natively, so no flip is needed.
- **Alpha:** PNGs without an alpha channel are forced to RGBA (`sharp.ensureAlpha()` on Node; Canvas always returns RGBA).

## Error Handling

The writer's preconditions (positive dimensions ≤ 65535, pixel buffer length matches `w*h*4`) are internal invariants enforced by the calling pipeline; violation indicates a bug, not user input. The writer throws `RangeError` in these cases — distinct from `ValidationError`, which is reserved for user-facing GLB validation problems.

No new user-facing errors. If the underlying image decode fails, the existing pipeline error path surfaces it.

## Testing

### Unit — `tests/unit/aseprite-writer.test.ts`

Use `ase-parser` (devDependency) for round-trip verification:

1. **Solid color round-trip.** Build a 4×4 red-only RGBA buffer, write, parse, assert width/height/layer count, decode the first cel and assert every pixel is `(255, 0, 0, 255)`.
2. **Mixed pattern round-trip.** 16×8 RGBA with a deterministic pattern (`(x*16, y*16, x^y, 255)`), write, parse, byte-for-byte compare cel pixels.
3. **Dimension validation.** Confirm `RangeError` on width=0, height=70000, and on mismatched pixel buffer length.
4. **Layer name preserved.** Write with `name: "baseColor"`, parse, assert `layers[0].name === "baseColor"`.

### Integration — extend existing fixture tests

For both Node (`runPipeline`) and Web (`runPack`):

1. Assert `outputs/<name>.aseprite` exists (Node) / `asepriteBytes` is a non-empty Uint8Array (Web).
2. Parse the result with `ase-parser`. Confirm `width`/`height` match `baseColorSize` from the pipeline result.
3. Confirm the zip output contains a `<name>.aseprite` entry when zip is enabled.

## Documentation

`README.md` updates:

- "What it does" example block: add `outputs/<name>.aseprite` to the listed outputs.
- "Browser Usage" code sample: show `result.asepriteBytes`.
- "Development → Project structure" tree: add `aseprite-writer.ts`.
- One sentence near the output description mentioning the file is a minimal RGBA single-layer `.aseprite` that Aseprite opens directly.

## Out of Scope (explicit)

- Multiple layers (PBR slots as layers). The API accepts an array but the pipeline only emits one entry for now.
- Multiple frames / animation.
- Indexed or grayscale color modes.
- Color profile / ICC chunks.
- Slices, tags, palette chunks.
- A `--no-aseprite` CLI flag. (YAGNI; the file is small and the cost is negligible.)
- Reading `.aseprite` files. This is a writer only.

## Future Extension Path

Multi-layer (the B option from brainstorming) becomes:

1. In `pipeline-core`, decode each PBR slot's cropped PNG via `decodeRgba` instead of just baseColor.
2. Pass an array of `AsepriteLayer` (one per slot) to `writeAseprite`. No writer change needed — the API already takes an array.

No format-level work beyond that.
