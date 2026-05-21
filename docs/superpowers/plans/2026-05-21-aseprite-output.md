# Aseprite Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a minimal RGBA single-layer `.aseprite` file alongside the existing PNG output, in both the Node CLI (`runPipeline`) and the web library (`runPack`).

**Architecture:** A pure-JS `.aseprite` writer in `src/core/aseprite-writer.ts` is reused by both Node and Web adapters. A new `decodeRgba` method on the `ImageOps` port converts the cropped baseColor PNG to top-down RGBA pixels (`sharp.raw()` on Node, Canvas `getImageData` on Web). The core pipeline emits `asepriteBytes` next to `baseColorPng`; the adapters then write a file / surface bytes / include it in the zip.

**Tech Stack:** TypeScript (NodeNext ESM), `fflate` (existing runtime dep) for zlib deflate, `sharp` (Node-only existing dep), Canvas2D API (Web), `vitest` for tests, `ase-parser` (new devDependency) for round-trip verification.

**Spec:** `docs/superpowers/specs/2026-05-21-aseprite-output-design.md`

---

## File Structure

```
src/
├─ core/
│  ├─ aseprite-writer.ts     # CREATE
│  └─ pipeline-core.ts        # MODIFY — emit asepriteBytes
│
├─ ports.ts                   # MODIFY — add decodeRgba to ImageOps
│
├─ node/
│  ├─ image-sharp.ts          # MODIFY — implement decodeRgba
│  └─ pipeline.ts             # MODIFY — write .aseprite, include in zip
│
├─ web/
│  ├─ image-canvas.ts         # MODIFY — implement decodeRgba
│  └─ pipeline.ts             # MODIFY — return asepriteBytes, include in zip
│
└─ cli.ts                     # MODIFY — log .aseprite write

tests/
├─ unit/core/aseprite-writer.test.ts    # CREATE
└─ integration/
   ├─ pipeline.test.ts                  # MODIFY — assert Node .aseprite output
   └─ web-pipeline.test.ts              # MODIFY — assert Web asepriteBytes

package.json                  # MODIFY — add ase-parser devDependency
README.md                     # MODIFY — outputs list, browser sample, tree, support note
```

---

## Task 1: Add `ase-parser` as devDependency

This is the round-trip parser used by the writer's unit tests and integration tests. Not a runtime dep.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run:
```bash
npm install --save-dev ase-parser
```

Expected: `package.json` now lists `"ase-parser": "^<version>"` under `devDependencies` and `package-lock.json` is updated.

- [ ] **Step 2: Verify resolvable**

Run:
```bash
node --input-type=module -e 'import("ase-parser").then(m => console.log(typeof m.default || typeof m))'
```

Expected: prints `function` (or `object` with a default export). No "Cannot find module" error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add ase-parser for .aseprite round-trip tests"
```

---

## Task 2: Create `core/aseprite-writer.ts` with the public signature

Create the file with only the types and a stub that throws, plus its first failing test. This is the TDD scaffold.

**Files:**
- Create: `src/core/aseprite-writer.ts`
- Create: `tests/unit/core/aseprite-writer.test.ts`

- [ ] **Step 1: Write the stub module**

Create `src/core/aseprite-writer.ts`:

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
  throw new Error("writeAseprite: not implemented");
}
```

- [ ] **Step 2: Write the first failing test (validation)**

Create `tests/unit/core/aseprite-writer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { writeAseprite } from "../../../src/core/aseprite-writer.js";

describe("writeAseprite — input validation", () => {
  it("throws RangeError on width=0", () => {
    expect(() => writeAseprite(0, 4, [{ name: "L", pixels: new Uint8Array(0) }]))
      .toThrow(RangeError);
  });

  it("throws RangeError on width > 65535", () => {
    expect(() => writeAseprite(70000, 4, [{ name: "L", pixels: new Uint8Array(70000 * 4 * 4) }]))
      .toThrow(RangeError);
  });

  it("throws RangeError on height=0", () => {
    expect(() => writeAseprite(4, 0, [{ name: "L", pixels: new Uint8Array(0) }]))
      .toThrow(RangeError);
  });

  it("throws RangeError when pixels length mismatches width*height*4", () => {
    expect(() => writeAseprite(2, 2, [{ name: "L", pixels: new Uint8Array(8) }]))
      .toThrow(RangeError);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/unit/core/aseprite-writer.test.ts
```

Expected: 4 tests fail with the message `writeAseprite: not implemented` (not RangeError). This confirms the test file resolves the new module correctly.

- [ ] **Step 4: Implement input validation**

Replace the body of `writeAseprite` in `src/core/aseprite-writer.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify validation passes**

Run:
```bash
npx vitest run tests/unit/core/aseprite-writer.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/aseprite-writer.ts tests/unit/core/aseprite-writer.test.ts
git commit -m "feat(core/aseprite-writer): scaffold + input validation"
```

---

## Task 3: Implement the binary writer

Replace the trailing `throw` with the actual header / frame / layer / cel writing. Use `fflate` for raw deflate and a manual zlib wrapping per the C# reference.

**Files:**
- Modify: `src/core/aseprite-writer.ts`

- [ ] **Step 1: Replace the module with the full implementation**

Overwrite `src/core/aseprite-writer.ts`:

```ts
import { deflateSync } from "fflate";

export interface AsepriteLayer {
  readonly name: string;
  /** RGBA, top-down, length = width * height * 4. */
  readonly pixels: Uint8Array;
}

const MAGIC_HEADER = 0xa5e0;
const MAGIC_FRAME = 0xf1fa;
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const CEL_TYPE_COMPRESSED = 2;
const ZLIB_CMF = 0x78;
const ZLIB_FLG = 0x9c;

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

  const w = new BinaryWriter();
  const fileSizePos = w.position;
  writeHeader(w, width, height);

  const frameStartPos = w.position;
  const chunkCount = layers.length * 2;
  writeFrameHeader(w, chunkCount);

  for (let i = 0; i < layers.length; i++) {
    writeLayerChunk(w, layers[i].name);
  }
  for (let i = 0; i < layers.length; i++) {
    writeCelChunk(w, i, width, height, layers[i].pixels);
  }

  const fileEnd = w.position;
  w.position = frameStartPos;
  w.u32(fileEnd - frameStartPos);
  w.position = fileSizePos;
  w.u32(fileEnd);

  return w.toBytes(fileEnd);
}

class BinaryWriter {
  private buf: Uint8Array;
  private view: DataView;
  public position = 0;
  private length = 0;

  constructor(initial = 1024) {
    this.buf = new Uint8Array(initial);
    this.view = new DataView(this.buf.buffer);
  }

  private grow(need: number): void {
    const required = this.position + need;
    if (required <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < required) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }
  private bump(n: number): void {
    this.position += n;
    if (this.position > this.length) this.length = this.position;
  }
  u8(v: number): void { this.grow(1); this.buf[this.position] = v & 0xff; this.bump(1); }
  u16(v: number): void { this.grow(2); this.view.setUint16(this.position, v, true); this.bump(2); }
  i16(v: number): void { this.grow(2); this.view.setInt16(this.position, v, true); this.bump(2); }
  u32(v: number): void { this.grow(4); this.view.setUint32(this.position, v >>> 0, true); this.bump(4); }
  bytes(b: Uint8Array): void { this.grow(b.length); this.buf.set(b, this.position); this.bump(b.length); }
  zeros(n: number): void { this.grow(n); this.bump(n); }
  toBytes(end?: number): Uint8Array {
    const finalLen = end ?? this.length;
    return this.buf.slice(0, finalLen);
  }
}

function writeHeader(w: BinaryWriter, width: number, height: number): void {
  w.u32(0);             // file size (backfilled)
  w.u16(MAGIC_HEADER);  // 0xA5E0
  w.u16(1);             // frames
  w.u16(width);
  w.u16(height);
  w.u16(32);            // color depth (RGBA)
  w.u32(1);             // flags (1 = layer opacity has valid value)
  w.u16(100);           // speed (deprecated)
  w.u32(0);             // reserved
  w.u32(0);             // reserved
  w.u8(0);              // transparent index
  w.zeros(3);           // reserved
  w.u16(0);             // num colors
  w.u8(1);              // pixel width
  w.u8(1);              // pixel height
  w.zeros(92);          // reserved
}

function writeFrameHeader(w: BinaryWriter, chunkCount: number): void {
  w.u32(0);                                              // frame size (backfilled)
  w.u16(MAGIC_FRAME);                                    // 0xF1FA
  w.u16(chunkCount > 0xffff ? 0xffff : chunkCount);      // old chunk count (u16)
  w.u16(100);                                            // duration ms
  w.zeros(2);                                            // reserved
  w.u32(chunkCount);                                     // new chunk count (u32)
}

function writeLayerChunk(w: BinaryWriter, name: string): void {
  const nameBytes = new TextEncoder().encode(name);
  const chunkSize = 6 + 18 + nameBytes.length;
  w.u32(chunkSize);
  w.u16(CHUNK_LAYER);
  // Body
  w.u16(0b11);   // flags: visible (1) | editable (2)
  w.u16(0);      // layer type (0 = image)
  w.u16(0);      // child level
  w.u16(0);      // default width (ignored)
  w.u16(0);      // default height (ignored)
  w.u16(0);      // blend mode (normal)
  w.u8(255);     // opacity
  w.zeros(3);    // reserved
  w.u16(nameBytes.length);
  w.bytes(nameBytes);
}

function writeCelChunk(
  w: BinaryWriter,
  layerIndex: number,
  width: number,
  height: number,
  pixels: Uint8Array,
): void {
  const deflated = deflateSync(pixels);
  const adler = adler32(pixels);
  const chunkSize = 32 + deflated.length;
  w.u32(chunkSize);
  w.u16(CHUNK_CEL);

  w.u16(layerIndex);
  w.i16(0);                       // x
  w.i16(0);                       // y
  w.u8(255);                      // opacity
  w.u16(CEL_TYPE_COMPRESSED);     // cel type 2
  w.zeros(7);                     // reserved

  w.u16(width);
  w.u16(height);
  w.u8(ZLIB_CMF);
  w.u8(ZLIB_FLG);
  w.bytes(deflated);
  // Adler32 big-endian
  w.u8((adler >>> 24) & 0xff);
  w.u8((adler >>> 16) & 0xff);
  w.u8((adler >>> 8) & 0xff);
  w.u8(adler & 0xff);
}

function adler32(data: Uint8Array): number {
  const MOD = 65521;
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b * 0x10000 + a) >>> 0);
}
```

- [ ] **Step 2: Run existing validation tests to make sure nothing regressed**

Run:
```bash
npx vitest run tests/unit/core/aseprite-writer.test.ts
```

Expected: 4 validation tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/core/aseprite-writer.ts
git commit -m "feat(core/aseprite-writer): emit RGBA single-layer .aseprite bytes"
```

---

## Task 4: Round-trip tests with `ase-parser`

Confirm the bytes we wrote can be parsed back to the same width/height/pixels.

**Files:**
- Modify: `tests/unit/core/aseprite-writer.test.ts`

- [ ] **Step 1: Append round-trip tests**

Append to `tests/unit/core/aseprite-writer.test.ts`:

```ts
import Aseprite from "ase-parser";
import { Buffer } from "node:buffer";

function parse(bytes: Uint8Array): Aseprite {
  const ase = new Aseprite(Buffer.from(bytes), "in-memory.aseprite");
  ase.parse();
  return ase;
}

function solidRGBA(w: number, h: number, r: number, g: number, b: number, a: number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4 + 0] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a;
  }
  return px;
}

describe("writeAseprite — round-trip with ase-parser", () => {
  it("preserves dimensions and a solid-color layer", () => {
    const px = solidRGBA(4, 4, 255, 0, 0, 255);
    const bytes = writeAseprite(4, 4, [{ name: "baseColor", pixels: px }]);

    const ase = parse(bytes);
    expect(ase.width).toBe(4);
    expect(ase.height).toBe(4);
    expect(ase.frames.length).toBe(1);

    const layers = ase.frames[0].cels;
    expect(layers.length).toBe(1);
    const cel = layers[0];
    expect(cel.w).toBe(4);
    expect(cel.h).toBe(4);
    const decoded = cel.rawCelData ?? cel.rawCel ?? cel.pixels;
    expect(decoded).toBeDefined();
    expect(decoded!.length).toBe(4 * 4 * 4);
    for (let i = 0; i < 4 * 4; i++) {
      expect(decoded![i * 4 + 0]).toBe(255);
      expect(decoded![i * 4 + 1]).toBe(0);
      expect(decoded![i * 4 + 2]).toBe(0);
      expect(decoded![i * 4 + 3]).toBe(255);
    }
  });

  it("preserves a per-pixel pattern byte-for-byte", () => {
    const w = 16, h = 8;
    const px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        px[o + 0] = (x * 16) & 0xff;
        px[o + 1] = (y * 16) & 0xff;
        px[o + 2] = (x ^ y) & 0xff;
        px[o + 3] = 255;
      }
    }
    const bytes = writeAseprite(w, h, [{ name: "L", pixels: px }]);

    const ase = parse(bytes);
    expect(ase.width).toBe(w);
    expect(ase.height).toBe(h);

    const cel = ase.frames[0].cels[0];
    const decoded = cel.rawCelData ?? cel.rawCel ?? cel.pixels;
    expect(decoded).toBeDefined();
    expect(decoded!.length).toBe(px.length);
    for (let i = 0; i < px.length; i++) {
      expect(decoded![i]).toBe(px[i]);
    }
  });

  it("preserves the layer name", () => {
    const px = solidRGBA(2, 2, 1, 2, 3, 4);
    const bytes = writeAseprite(2, 2, [{ name: "baseColor", pixels: px }]);
    const ase = parse(bytes);
    expect(ase.layers.length).toBe(1);
    expect(ase.layers[0].name).toBe("baseColor");
  });
});
```

> **Note on `ase-parser`'s decoded-pixels field:** Different versions name the property differently (`rawCelData`, `rawCel`, or `pixels`). The tests use `??` to accept whichever is present. If all three are undefined, fix by inspecting `Object.keys(cel)` in a quick debug print and naming the actual field.

- [ ] **Step 2: Run round-trip tests**

Run:
```bash
npx vitest run tests/unit/core/aseprite-writer.test.ts
```

Expected: All 7 tests pass (4 validation + 3 round-trip).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/core/aseprite-writer.test.ts
git commit -m "test(core/aseprite-writer): round-trip via ase-parser"
```

---

## Task 5: Add `decodeRgba` to `ImageOps` port

Extend the port interface and let the type-only change break the adapters.

**Files:**
- Modify: `src/ports.ts`

- [ ] **Step 1: Add the method to the interface**

Edit `src/ports.ts` — replace the `ImageOps` interface with:

```ts
export interface ImageOps {
  /** Read the dimensions of an encoded image (PNG/JPEG bytes). */
  readonly probe: (buf: Uint8Array) => Promise<{ width: number; height: number }>;
  /** Crop the given image to the given pixel rect, return PNG bytes. */
  readonly cropToPng: (
    buf: Uint8Array,
    rect: { left: number; top: number; width: number; height: number },
  ) => Promise<Uint8Array>;
  /** Decode encoded image bytes (PNG/JPEG) to raw RGBA, top-down (length = width*height*4). */
  readonly decodeRgba: (
    buf: Uint8Array,
  ) => Promise<{ width: number; height: number; pixels: Uint8Array }>;
}
```

- [ ] **Step 2: Run the typecheck to confirm both adapters now fail to satisfy ImageOps**

Run:
```bash
npx tsc --noEmit
```

Expected: TypeScript errors point at `src/node/image-sharp.ts` and `src/web/image-canvas.ts` — both report that the object literal is missing `decodeRgba`. This confirms the contract change reaches the adapters. We will fix them in tasks 6 and 7.

- [ ] **Step 3: Commit**

```bash
git add src/ports.ts
git commit -m "feat(ports): add decodeRgba to ImageOps"
```

---

## Task 6: Implement `decodeRgba` in the Node adapter (sharp)

**Files:**
- Modify: `src/node/image-sharp.ts`

- [ ] **Step 1: Implement**

Edit `src/node/image-sharp.ts` — replace the file with:

```ts
import sharp from "sharp";
import type { ImageOps } from "../ports.js";

export const nodeImageOps: ImageOps = {
  async probe(buf) {
    const meta = await sharp(Buffer.from(buf)).metadata();
    if (!meta.width || !meta.height) {
      throw new Error("nodeImageOps.probe: unreadable image dimensions");
    }
    return { width: meta.width, height: meta.height };
  },

  async cropToPng(buf, rect) {
    const cropped = await sharp(Buffer.from(buf))
      .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
      .png()
      .toBuffer();
    return new Uint8Array(cropped);
  },

  async decodeRgba(buf) {
    const { data, info } = await sharp(Buffer.from(buf))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      width: info.width,
      height: info.height,
      pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    };
  },
};
```

- [ ] **Step 2: Typecheck — Node adapter should now satisfy ImageOps**

Run:
```bash
npx tsc --noEmit
```

Expected: only `src/web/image-canvas.ts` is still reported as missing `decodeRgba`. The Node adapter is no longer in the error list.

- [ ] **Step 3: Smoke test — call decodeRgba on a known PNG and assert shape**

Append a temporary test (or run inline). Add to a new file `tests/unit/node-image-sharp.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { nodeImageOps } from "../../src/node/image-sharp.js";

describe("nodeImageOps.decodeRgba", () => {
  it("returns RGBA top-down pixels with matching dimensions", async () => {
    // Build a 3×2 PNG: row 0 red, row 1 blue (top-down).
    const raw = new Uint8Array([
      255, 0, 0, 255,   255, 0, 0, 255,   255, 0, 0, 255,
      0, 0, 255, 255,   0, 0, 255, 255,   0, 0, 255, 255,
    ]);
    const png = await sharp(raw, { raw: { width: 3, height: 2, channels: 4 } })
      .png()
      .toBuffer();

    const out = await nodeImageOps.decodeRgba(new Uint8Array(png));
    expect(out.width).toBe(3);
    expect(out.height).toBe(2);
    expect(out.pixels.length).toBe(3 * 2 * 4);
    // Top row red
    expect(out.pixels[0]).toBe(255);
    expect(out.pixels[1]).toBe(0);
    expect(out.pixels[2]).toBe(0);
    expect(out.pixels[3]).toBe(255);
    // Second-row first pixel blue
    expect(out.pixels[3 * 4 + 0]).toBe(0);
    expect(out.pixels[3 * 4 + 1]).toBe(0);
    expect(out.pixels[3 * 4 + 2]).toBe(255);
    expect(out.pixels[3 * 4 + 3]).toBe(255);
  });
});
```

- [ ] **Step 4: Run the smoke test**

Run:
```bash
npx vitest run tests/unit/node-image-sharp.test.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add src/node/image-sharp.ts tests/unit/node-image-sharp.test.ts
git commit -m "feat(node/image-sharp): implement decodeRgba"
```

---

## Task 7: Implement `decodeRgba` in the Web adapter (Canvas2D)

Mirror the existing native + canvas-package dual-path used by `probe`/`cropToPng`.

**Files:**
- Modify: `src/web/image-canvas.ts`

- [ ] **Step 1: Implement the dual-path decodeRgba**

Edit `src/web/image-canvas.ts` — after the existing `cropToPngImpl` function and before the `export const webImageOps`, insert:

```ts
async function decodeRgbaImpl(buf: Uint8Array): Promise<{ width: number; height: number; pixels: Uint8Array }> {
  if (hasNativeCanvas()) {
    const img = await loadImageNative(buf);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("webImageOps.decodeRgba: 2d context unavailable");
    ctx.drawImage(img as unknown as CanvasImageSource, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      pixels: new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.byteLength),
    };
  }
  const pkg = await tryLoadCanvasPkg();
  if (!pkg) throw new Error("webImageOps.decodeRgba: no canvas implementation available");
  const img = await pkg.loadImage(Buffer.from(buf));
  const canvas = pkg.createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  return {
    width: img.width,
    height: img.height,
    pixels: new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.byteLength),
  };
}
```

Then update the export at the bottom of the file:

```ts
export const webImageOps: ImageOps = {
  probe: probeImpl,
  cropToPng: cropToPngImpl,
  decodeRgba: decodeRgbaImpl,
};
```

- [ ] **Step 2: Typecheck — all adapters should now satisfy ImageOps**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test in the web env**

Look at `tests/unit/web/` for existing test patterns. If a similar pattern exists (image-canvas test), append a `decodeRgba` case mirroring the Node smoke test. Otherwise create `tests/unit/web/image-canvas.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { webImageOps } from "../../../src/web/image-canvas.js";

describe("webImageOps.decodeRgba", () => {
  it("returns RGBA top-down pixels via the canvas-package fallback", async () => {
    const raw = new Uint8Array([
      255, 0, 0, 255,   255, 0, 0, 255,   255, 0, 0, 255,
      0, 0, 255, 255,   0, 0, 255, 255,   0, 0, 255, 255,
    ]);
    const png = await sharp(raw, { raw: { width: 3, height: 2, channels: 4 } })
      .png()
      .toBuffer();

    const out = await webImageOps.decodeRgba(new Uint8Array(png));
    expect(out.width).toBe(3);
    expect(out.height).toBe(2);
    expect(out.pixels[0]).toBe(255);
    expect(out.pixels[1]).toBe(0);
    expect(out.pixels[2]).toBe(0);
    expect(out.pixels[3 * 4 + 2]).toBe(255); // second row first pixel: blue channel
  });
});
```

- [ ] **Step 4: Run the smoke test**

Run:
```bash
npx vitest run tests/unit/web/image-canvas.test.ts
```

Expected: 1 test passes. (Inside `happy-dom`, `hasNativeCanvas()` returns `false` and the canvas-package fallback runs.)

- [ ] **Step 5: Commit**

```bash
git add src/web/image-canvas.ts tests/unit/web/image-canvas.test.ts
git commit -m "feat(web/image-canvas): implement decodeRgba via Canvas2D"
```

---

## Task 8: Emit `asepriteBytes` from `pipeline-core`

Hook the writer into the core pipeline. The host adapter receives the bytes via the result.

**Files:**
- Modify: `src/core/pipeline-core.ts`

- [ ] **Step 1: Add the field and the call**

Edit `src/core/pipeline-core.ts`:

Add to the top imports:
```ts
import { writeAseprite } from "./aseprite-writer.js";
```

Replace the `CoreResult` interface:
```ts
export interface CoreResult {
  /** The cropped baseColor texture as PNG bytes. */
  baseColorPng: Uint8Array;
  /** The cropped baseColor texture as a minimal single-layer .aseprite. */
  asepriteBytes: Uint8Array;
  /** UV bounding box that was computed and used for cropping/remapping. */
  bbox: UvBbox;
  /** Pixel size of the cropped baseColor texture. */
  baseColorSize: { width: number; height: number };
}
```

At the end of `runCore`, just before the existing `return` statement, add:

```ts
  const rgba = await image.decodeRgba(baseColorPng);
  const asepriteBytes = writeAseprite(rgba.width, rgba.height, [
    { name: "baseColor", pixels: rgba.pixels },
  ]);
```

Update the return:

```ts
  return { baseColorPng, asepriteBytes, bbox, baseColorSize };
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors. (The adapter pipelines don't yet *use* `asepriteBytes`, but the type field is optional to consume.)

- [ ] **Step 3: Re-run all unit tests**

Run:
```bash
npx vitest run tests/unit
```

Expected: every existing unit test still passes.

- [ ] **Step 4: Commit**

```bash
git add src/core/pipeline-core.ts
git commit -m "feat(core/pipeline-core): emit asepriteBytes alongside baseColorPng"
```

---

## Task 9: Write `.aseprite` from the Node CLI / `runPipeline`

Adapter writes the file, includes it in the zip, surfaces the path in the result.

**Files:**
- Modify: `src/node/pipeline.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Update `node/pipeline.ts`**

Edit `src/node/pipeline.ts` — replace the file with:

```ts
import { writeFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { runCore } from "../core/pipeline-core.js";
import type { UvBbox } from "../core/uv-bbox.js";
import { nodeImageOps } from "./image-sharp.js";
import { nodeZipOps } from "./zip-archiver.js";
import { readGlbFromPath, writeGlbToBytes } from "./glb-io.js";

export interface PipelineOptions {
  inputPath: string;
  outputDir: string;
  zip: boolean;
}

export interface PipelineResult {
  bbox: UvBbox;
  baseColorSize: { width: number; height: number };
  outputs: { glb: string; png: string; aseprite: string; zip: string | null };
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const stem = basename(opts.inputPath, extname(opts.inputPath));
  const outGlbPath = join(opts.outputDir, `${stem}.glb`);
  const outPngPath = join(opts.outputDir, `${stem}.png`);
  const outAsePath = join(opts.outputDir, `${stem}.aseprite`);
  const outZipPath = join(opts.outputDir, `${stem}.zip`);

  const doc = await readGlbFromPath(opts.inputPath);
  const result = await runCore({ doc, image: nodeImageOps });
  const outGlbBytes = await writeGlbToBytes(doc);

  await writeFile(outGlbPath, outGlbBytes);
  await writeFile(outPngPath, result.baseColorPng);
  await writeFile(outAsePath, result.asepriteBytes);

  let zipPath: string | null = null;
  if (opts.zip) {
    const zipBytes = await nodeZipOps.pack([
      { name: `${stem}.glb`, bytes: outGlbBytes },
      { name: `${stem}.png`, bytes: result.baseColorPng },
      { name: `${stem}.aseprite`, bytes: result.asepriteBytes },
    ]);
    await writeFile(outZipPath, zipBytes);
    zipPath = outZipPath;
  }

  return {
    bbox: result.bbox,
    baseColorSize: result.baseColorSize,
    outputs: { glb: outGlbPath, png: outPngPath, aseprite: outAsePath, zip: zipPath },
  };
}
```

- [ ] **Step 2: Update CLI log output**

Edit `src/cli.ts` — find the block that prints the output paths:

```ts
    process.stdout.write(`✓ Wrote ${result.outputs.glb}\n`);
    process.stdout.write(`✓ Wrote ${result.outputs.png}\n`);
    if (result.outputs.zip) process.stdout.write(`✓ Wrote ${result.outputs.zip}\n`);
```

Change to:

```ts
    process.stdout.write(`✓ Wrote ${result.outputs.glb}\n`);
    process.stdout.write(`✓ Wrote ${result.outputs.png}\n`);
    process.stdout.write(`✓ Wrote ${result.outputs.aseprite}\n`);
    if (result.outputs.zip) process.stdout.write(`✓ Wrote ${result.outputs.zip}\n`);
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke run the CLI against the fixture**

Run:
```bash
npx tsx src/cli.ts JerseyBarrierB
ls -la outputs/JerseyBarrierB.*
```

Expected stdout contains:
```
✓ Wrote outputs/JerseyBarrierB.aseprite
```
And `outputs/JerseyBarrierB.aseprite` exists with size > 0.

- [ ] **Step 5: Commit**

```bash
git add src/node/pipeline.ts src/cli.ts
git commit -m "feat(node): write .aseprite alongside .png and include in zip"
```

---

## Task 10: Return `asepriteBytes` from `runPack` (web)

**Files:**
- Modify: `src/web/pipeline.ts`

- [ ] **Step 1: Update `web/pipeline.ts`**

Edit `src/web/pipeline.ts` — replace the file with:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/pipeline.ts
git commit -m "feat(web): return asepriteBytes and include in zip"
```

---

## Task 11: Integration test — Node `runPipeline` writes a valid `.aseprite`

**Files:**
- Modify: `tests/integration/pipeline.test.ts`

- [ ] **Step 1: Extend the integration test**

Edit `tests/integration/pipeline.test.ts` — add the new imports and assertions.

Replace the imports block with:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, rm, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
import Aseprite from "ase-parser";
import { Buffer } from "node:buffer";
import { unzipSync } from "fflate";
import { runPipeline } from "../../src/node/index.js";
```

After the existing assertion 3 (the `meta = await sharp(...)` block), append:

```ts
    // 4. .aseprite output exists, parses, and reports the same dimensions.
    expect(existsSync(result.outputs.aseprite)).toBe(true);
    expect((await stat(result.outputs.aseprite)).size).toBeGreaterThan(0);

    const aseBytes = await readFile(result.outputs.aseprite);
    const ase = new Aseprite(aseBytes, "JerseyBarrierB.aseprite");
    ase.parse();
    expect(ase.width).toBe(result.baseColorSize.width);
    expect(ase.height).toBe(result.baseColorSize.height);
    expect(ase.layers[0].name).toBe("baseColor");

    // 5. The zip contains the .aseprite entry.
    const zipBytes = await readFile(result.outputs.zip!);
    const entries = unzipSync(new Uint8Array(zipBytes));
    expect(Object.keys(entries)).toContain("JerseyBarrierB.aseprite");
    expect(entries["JerseyBarrierB.aseprite"].length).toBeGreaterThan(0);
```

- [ ] **Step 2: Run the integration test**

Run:
```bash
npx vitest run tests/integration/pipeline.test.ts
```

Expected: test passes (including the new assertions 4 and 5).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/pipeline.test.ts
git commit -m "test(integration): assert Node pipeline .aseprite output and zip entry"
```

---

## Task 12: Integration test — Web `runPack` returns valid `asepriteBytes`

**Files:**
- Modify: `tests/integration/web-pipeline.test.ts`

- [ ] **Step 1: Extend the web integration test**

Edit `tests/integration/web-pipeline.test.ts`.

Replace the imports block with:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import Aseprite from "ase-parser";
import { Buffer } from "node:buffer";
import { unzipSync } from "fflate";
import { runPack, ValidationError } from "../../src/web/index.js";
```

In the existing test `"packs the JerseyBarrier model end-to-end from bytes"`, append after the existing assertion 3:

```ts
    // 4. asepriteBytes is present, parses, and reports the same dimensions.
    expect(result.asepriteBytes.byteLength).toBeGreaterThan(0);
    const ase = new Aseprite(Buffer.from(result.asepriteBytes), "test.aseprite");
    ase.parse();
    expect(ase.width).toBe(result.baseColorSize.width);
    expect(ase.height).toBe(result.baseColorSize.height);
    expect(ase.layers[0].name).toBe("baseColor");

    // 5. The zip contains the .aseprite entry.
    const entries = unzipSync(result.zipBytes!);
    expect(Object.keys(entries)).toContain("test.aseprite");
    expect(entries["test.aseprite"].length).toBeGreaterThan(0);
```

- [ ] **Step 2: Run the test**

Run:
```bash
npx vitest run tests/integration/web-pipeline.test.ts
```

Expected: both web integration tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/web-pipeline.test.ts
git commit -m "test(integration): assert Web runPack asepriteBytes and zip entry"
```

---

## Task 13: Run the full test suite

Make sure nothing else regressed.

- [ ] **Step 1: Run everything**

Run:
```bash
npm test
```

Expected: all suites pass (unit + integration).

- [ ] **Step 2: Build**

Run:
```bash
npm run build
```

Expected: tsc emits to `dist/` with no errors.

- [ ] **Step 3: Smoke the built CLI**

Run:
```bash
node dist/cli.js JerseyBarrierB
ls -la outputs/JerseyBarrierB.*
```

Expected: stdout includes `✓ Wrote outputs/JerseyBarrierB.aseprite` and the file exists.

(No commit for this task — verification only.)

---

## Task 14: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the "What it does" output block**

Edit `README.md` — find this block near the top:

```
input  : models/<name>.glb        (texture has lots of empty space)
output : outputs/<name>.glb       (UVs remapped, all textures cropped + embedded)
         outputs/<name>.png       (cropped baseColor texture, separate file)
         outputs/<name>.zip       (the .glb + .png, flat zipped)
```

Replace with:

```
input  : models/<name>.glb        (texture has lots of empty space)
output : outputs/<name>.glb       (UVs remapped, all textures cropped + embedded)
         outputs/<name>.png       (cropped baseColor texture, separate file)
         outputs/<name>.aseprite  (cropped baseColor as a minimal single-layer .aseprite)
         outputs/<name>.zip       (the .glb + .png + .aseprite, flat zipped)
```

- [ ] **Step 2: Update the "Example output" block**

Find:

```
✓ Wrote outputs/JerseyBarrierB.glb
✓ Wrote outputs/JerseyBarrierB.png
✓ Wrote outputs/JerseyBarrierB.zip
```

Replace with:

```
✓ Wrote outputs/JerseyBarrierB.glb
✓ Wrote outputs/JerseyBarrierB.png
✓ Wrote outputs/JerseyBarrierB.aseprite
✓ Wrote outputs/JerseyBarrierB.zip
```

- [ ] **Step 3: Update the Browser Usage code sample**

Find the comment block describing `runPack` result fields and add a line:

```ts
  // result.glbBytes      — Uint8Array, the new GLB
  // result.baseColorPng  — Uint8Array, the cropped baseColor PNG
  // result.zipBytes      — Uint8Array | null
  // result.bbox          — { uMin, vMin, uMax, vMax }
  // result.baseColorSize — { width, height }
```

Replace with:

```ts
  // result.glbBytes       — Uint8Array, the new GLB
  // result.baseColorPng   — Uint8Array, the cropped baseColor PNG
  // result.asepriteBytes  — Uint8Array, the cropped baseColor as .aseprite
  // result.zipBytes       — Uint8Array | null
  // result.bbox           — { uMin, vMin, uMax, vMax }
  // result.baseColorSize  — { width, height }
```

- [ ] **Step 4: Update the "How it works" final step**

Find:

```
6. Write the new GLB (textures embedded), a separate baseColor PNG, and a flat zip.
```

Replace with:

```
6. Write the new GLB (textures embedded), a separate baseColor PNG, a minimal RGBA single-layer .aseprite of the same baseColor, and a flat zip.
```

- [ ] **Step 5: Update the project structure tree**

Find the `src/` tree under "Project structure:" and replace it with:

```
src/
├─ cli.ts                # argv → pipeline → exit code
├─ ports.ts              # ImageOps (probe / cropToPng / decodeRgba), ZipOps
├─ core/
│  ├─ aseprite-writer.ts # pure: (w, h, layers) → minimal .aseprite bytes
│  ├─ bbox-to-rect.ts
│  ├─ errors.ts
│  ├─ pipeline-core.ts
│  ├─ remap-uv.ts
│  ├─ uv-bbox.ts
│  └─ validate.ts
├─ node/                 # sharp-based image ops, archiver-based zip, NodeIO glTF
└─ web/                  # Canvas2D image ops, fflate-based zip, WebIO glTF
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document .aseprite output and decodeRgba port"
```

---

## Self-Review Summary

**Spec coverage:**
- Additive output (PNG kept) → Tasks 9, 10
- Single-layer/single-frame RGBA writer → Tasks 2, 3
- Pure-JS writer in `src/core/aseprite-writer.ts` → Tasks 2, 3
- Both environments → Tasks 9 (Node), 10 (Web)
- `fflate` for zlib → Task 3 (`deflateSync`)
- `decodeRgba` in `ImageOps` → Tasks 5, 6, 7
- Throws `RangeError` for bad dimensions / pixel buffer → Task 2 (validation)
- Round-trip tests with `ase-parser` → Task 4
- Integration: file exists + parses + zip entry → Tasks 11, 12
- README updates → Task 14
- No CLI flag (always emits) → Task 9 (no flag added)

**No placeholders:** Every code step shows complete code.

**Type consistency:** `AsepriteLayer`, `writeAseprite`, `decodeRgba`, `asepriteBytes`, `outputs.aseprite`, `PackResult.asepriteBytes`, `PipelineResult.outputs.aseprite` are used consistently across tasks.
