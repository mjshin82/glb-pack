# glb-pack v0.2 (Browser Support) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `glb-pack` into `core` + `node` + `web` adapters and publish v0.2.0 with a new `glb-pack/web` sub-export so the same crop+remap algorithm runs in browsers without native dependencies.

**Architecture:** Hexagonal — `src/core/` holds environment-agnostic logic and depends only on a small `ImageOps` port; `src/node/` and `src/web/` provide adapter implementations and own their own glTF read/write.

**Tech Stack:** TypeScript (strict, NodeNext modules), `@gltf-transform/core` (NodeIO+WebIO), `sharp` (Node images), `archiver` (Node zip), `fflate` (Browser zip, **new dep**), Canvas2D (Browser images, native), `vitest` + `happy-dom` + `canvas` for tests.

**Spec:** `docs/superpowers/specs/2026-05-08-glb-pack-web-design.md`

---

## Plan-Level Refinement of Spec

The spec defines a `GltfIO` port with both `read(bytes)` and `write(doc)`. After deeper review, this design causes a Node regression: NodeIO's path-based `read(path)` resolves external textures relative to the file path, but `readBinary(bytes)` cannot — losing v0.1's "external texture support." The plan therefore:

- **Removes `GltfIO` from `src/ports.ts`.** Only `ImageOps` and `ZipOps` remain.
- **`runCore` takes a pre-loaded `Document`**, not bytes. Each adapter is responsible for its own glTF read/write — Node uses `NodeIO.read(path)` (path-based, preserves external texture resolution); Web uses `NodeIO.readBinary(bytes)` (bytes-only, since browsers have no filesystem).
- The Document is mutated in place inside `runCore`. The adapter wrapper serializes it via `NodeIO.writeBinary(doc)` after `runCore` returns.

This is a correctness-driven refinement and does not affect the public API surface (`runPipeline` for Node, `runPack` for Web).

---

## File Map

```
src/
├─ core/
│  ├─ errors.ts                 # moved from src/errors.ts
│  ├─ uv-bbox.ts                # moved from src/uv-bbox.ts
│  ├─ remap-uv.ts               # moved from src/remap-uv.ts
│  ├─ validate.ts               # moved from src/validate.ts
│  ├─ bbox-to-rect.ts           # NEW — pure helper (UV bbox + size → pixel rect)
│  └─ pipeline-core.ts          # NEW — runCore(doc, image) → { baseColorPng, bbox, baseColorSize }
│
├─ ports.ts                     # NEW — ImageOps, ZipOps interfaces
│
├─ node/
│  ├─ image-sharp.ts            # NEW — ImageOps via sharp
│  ├─ zip-archiver.ts           # NEW — ZipOps via archiver (replaces src/pack-zip.ts)
│  ├─ glb-io.ts                 # NEW — readGlbFromPath / writeGlbToBytes via NodeIO
│  ├─ pipeline.ts               # NEW — runPipeline(opts), wraps runCore + I/O + zip
│  └─ index.ts                  # NEW — public Node API
│
├─ web/
│  ├─ image-canvas.ts           # NEW — ImageOps via Canvas2D
│  ├─ zip-fflate.ts             # NEW — ZipOps via fflate
│  ├─ glb-io.ts                 # NEW — read/write via NodeIO.readBinary/writeBinary
│  ├─ pipeline.ts               # NEW — runPack(bytes, opts) wraps runCore + zip
│  └─ index.ts                  # NEW — public Web API
│
└─ cli.ts                       # MODIFIED — imports from ./node/index.js

tests/
├─ unit/
│  ├─ uv-bbox.test.ts           # MODIFIED — import path → core/
│  ├─ remap-uv.test.ts          # MODIFIED — import path → core/
│  ├─ validate.test.ts          # MODIFIED — import path → core/
│  ├─ core/
│  │  ├─ bbox-to-rect.test.ts   # NEW
│  │  └─ pipeline-core.test.ts  # NEW (mock adapters)
│  └─ web/
│     └─ zip-fflate.test.ts     # NEW (happy-dom env)
└─ integration/
   ├─ pipeline.test.ts          # MODIFIED — import path → node/
   └─ web-pipeline.test.ts      # NEW (happy-dom + canvas env)

DELETED after refactor:
   src/errors.ts
   src/uv-bbox.ts
   src/remap-uv.ts
   src/validate.ts
   src/load.ts
   src/crop-textures.ts
   src/write-glb.ts
   src/write-png.ts
   src/pack-zip.ts
   src/pipeline.ts
```

---

## Task 1: Move pure modules into `src/core/`

**Files:**
- Move (git mv): `src/errors.ts` → `src/core/errors.ts`
- Move: `src/uv-bbox.ts` → `src/core/uv-bbox.ts`
- Move: `src/remap-uv.ts` → `src/core/remap-uv.ts`
- Move: `src/validate.ts` → `src/core/validate.ts`
- Modify: `src/pipeline.ts`, `src/cli.ts`, `tests/unit/uv-bbox.test.ts`, `tests/unit/remap-uv.test.ts`, `tests/unit/validate.test.ts`

This is a pure rename; no behavior change. The unit tests must still pass.

- [ ] **Step 1: Create core directory and move files**

```bash
mkdir -p src/core
git mv src/errors.ts src/core/errors.ts
git mv src/uv-bbox.ts src/core/uv-bbox.ts
git mv src/remap-uv.ts src/core/remap-uv.ts
git mv src/validate.ts src/core/validate.ts
```

- [ ] **Step 2: Update internal imports**

Inside `src/pipeline.ts`, change three import lines:

```ts
// before
import { computeUvBbox } from "./uv-bbox.js";
import type { UvBbox } from "./uv-bbox.js";
import { remapUv } from "./remap-uv.js";
// after
import { computeUvBbox } from "./core/uv-bbox.js";
import type { UvBbox } from "./core/uv-bbox.js";
import { remapUv } from "./core/remap-uv.js";
```

(Note: the `validate` import in `pipeline.ts` may not exist directly in v0.1 — `validate` is called from inside the existing `pipeline.ts`. If you find an import like `import { validate } from "./validate.js";`, change it to `./core/validate.js`. Same for any `from "./errors.js"` → `./core/errors.js` if present.)

Inside `src/cli.ts`, change:

```ts
// before
import { ValidationError } from "./errors.js";
// after
import { ValidationError } from "./core/errors.js";
```

(Also keep the `runPipeline` import as-is for now — `./pipeline.js`. We move it later.)

Inside `src/core/validate.ts` itself, the `import { ValidationError } from "./errors.js";` stays unchanged because both files are now siblings in `core/`.

- [ ] **Step 3: Update test imports**

`tests/unit/uv-bbox.test.ts`:

```ts
// before
import { computeUvBbox } from "../../src/uv-bbox.js";
// after
import { computeUvBbox } from "../../src/core/uv-bbox.js";
```

`tests/unit/remap-uv.test.ts`:

```ts
// before
import { remapUv } from "../../src/remap-uv.js";
// after
import { remapUv } from "../../src/core/remap-uv.js";
```

`tests/unit/validate.test.ts`:

```ts
// before
import { validate } from "../../src/validate.js";
import { ValidationError } from "../../src/errors.js";
// after
import { validate } from "../../src/core/validate.js";
import { ValidationError } from "../../src/core/errors.js";
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: 4 test files, 19 passed (was 19, still 19 — no behavior change).

- [ ] **Step 5: Run tsc**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git -c user.email=dev@concode.co -c user.name=dev commit -m "refactor: move pure modules into src/core/

No behavior change. Imports updated in cli.ts, pipeline.ts, and the
three unit test files. All 19 tests pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `src/ports.ts` interfaces

**Files:**
- Create: `src/ports.ts`

`ImageOps` is consumed by `src/core/pipeline-core.ts`. `ZipOps` is consumed by adapter wrappers (not core). Both are listed here together for discoverability.

- [ ] **Step 1: Write the file**

```ts
// src/ports.ts

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
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ports.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(ports): add ImageOps and ZipOps interfaces

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add `src/core/bbox-to-rect.ts` (pure helper)

**Files:**
- Create: `src/core/bbox-to-rect.ts`
- Test: `tests/unit/core/bbox-to-rect.test.ts`

Pure function that maps a UV bbox + image size to an integer pixel rect. Outward rounding (floor min, ceil max), clamped to image bounds, with a minimum 1×1 size for degenerate bboxes. The math comes verbatim from the v0.1 `crop-textures.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/bbox-to-rect.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bboxToPixelRect } from "../../../src/core/bbox-to-rect.js";

describe("bboxToPixelRect", () => {
  it("maps a unit bbox to the full image rect", () => {
    expect(
      bboxToPixelRect(
        { uMin: 0, vMin: 0, uMax: 1, vMax: 1 },
        { width: 1024, height: 1024 },
      ),
    ).toEqual({ left: 0, top: 0, width: 1024, height: 1024 });
  });

  it("maps a centered quarter bbox proportionally", () => {
    expect(
      bboxToPixelRect(
        { uMin: 0.25, vMin: 0.25, uMax: 0.75, vMax: 0.75 },
        { width: 1024, height: 1024 },
      ),
    ).toEqual({ left: 256, top: 256, width: 512, height: 512 });
  });

  it("uses outward rounding (floor min, ceil max) when edges are mid-pixel", () => {
    // 0.105 * 100 = 10.5 → floor = 10
    // 0.895 * 100 = 89.5 → ceil  = 90
    expect(
      bboxToPixelRect(
        { uMin: 0.105, vMin: 0.105, uMax: 0.895, vMax: 0.895 },
        { width: 100, height: 100 },
      ),
    ).toEqual({ left: 10, top: 10, width: 80, height: 80 });
  });

  it("clamps to the image bounds when bbox slightly exceeds [0,1]", () => {
    expect(
      bboxToPixelRect(
        { uMin: -1e-7, vMin: -1e-7, uMax: 1 + 1e-7, vMax: 1 + 1e-7 },
        { width: 100, height: 100 },
      ),
    ).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });

  it("yields a 1x1 rect for a fully degenerate (zero-area) bbox", () => {
    const r = bboxToPixelRect(
      { uMin: 0.5, vMin: 0.5, uMax: 0.5, vMax: 0.5 },
      { width: 100, height: 100 },
    );
    expect(r).toEqual({ left: 50, top: 50, width: 1, height: 1 });
  });
});
```

- [ ] **Step 2: Run, see it fail**

Run: `npx vitest run tests/unit/core/bbox-to-rect.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `src/core/bbox-to-rect.ts`:

```ts
import type { UvBbox } from "./uv-bbox.js";

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function bboxToPixelRect(
  bbox: UvBbox,
  size: { width: number; height: number },
): PixelRect {
  const left = Math.max(0, Math.floor(bbox.uMin * size.width));
  const top = Math.max(0, Math.floor(bbox.vMin * size.height));
  const right = Math.min(size.width, Math.ceil(bbox.uMax * size.width));
  const bottom = Math.min(size.height, Math.ceil(bbox.vMax * size.height));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
```

- [ ] **Step 4: Run, see it pass**

Run: `npx vitest run tests/unit/core/bbox-to-rect.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/core/bbox-to-rect.ts tests/unit/core/bbox-to-rect.test.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(core/bbox-to-rect): pure UV bbox → pixel rect helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add `src/core/pipeline-core.ts` (orchestrator)

**Files:**
- Create: `src/core/pipeline-core.ts`
- Test: `tests/unit/core/pipeline-core.test.ts`

`runCore` does the entire environment-independent flow on a pre-loaded Document: validate, compute bbox, crop every texture in place via `ImageOps`, capture the baseColor PNG, and remap every unique UV accessor. The Document is mutated in place; the wrapper serializes it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/pipeline-core.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Document } from "@gltf-transform/core";
import { runCore } from "../../../src/core/pipeline-core.js";
import type { ImageOps } from "../../../src/ports.js";

function buildSingleMaterialDoc(
  uvs: number[] = [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5],
): Document {
  const doc = new Document();
  doc.createBuffer();
  const tex = doc
    .createTexture("base")
    .setImage(new Uint8Array([0]))  // sentinel — mock ImageOps doesn't decode
    .setMimeType("image/png");
  const mat = doc.createMaterial("M").setBaseColorTexture(tex);
  const acc = doc.createAccessor()
    .setType("VEC2")
    .setArray(new Float32Array(uvs));
  const prim = doc.createPrimitive().setMaterial(mat).setAttribute("TEXCOORD_0", acc);
  doc.createMesh("Mesh1").addPrimitive(prim);
  return doc;
}

interface MockImageOps extends ImageOps {
  probeCalls: number;
  cropCalls: Array<{ rect: { left: number; top: number; width: number; height: number } }>;
}

function makeMockImageOps(textureSize = { width: 100, height: 100 }): MockImageOps {
  const cropCalls: Array<{ rect: any }> = [];
  let probeCalls = 0;
  const ops: MockImageOps = {
    probe: async () => {
      probeCalls++;
      return textureSize;
    },
    cropToPng: async (_buf, rect) => {
      cropCalls.push({ rect });
      return new Uint8Array([0xFF, 0xFE, 0xFD]);  // sentinel "cropped" bytes
    },
    get probeCalls() { return probeCalls; },
    cropCalls,
  };
  return ops;
}

describe("runCore", () => {
  it("computes the bbox, crops each texture, mutates UVs, returns aux data", async () => {
    const doc = buildSingleMaterialDoc();  // UVs in (0,0)-(0.5,0.5)
    const image = makeMockImageOps();      // 100×100 texture

    const result = await runCore({ doc, image });

    // bbox of the four corner UVs
    expect(result.bbox).toEqual({ uMin: 0, vMin: 0, uMax: 0.5, vMax: 0.5 });

    // image port was called: 1 probe + 1 crop (one texture)
    expect(image.probeCalls).toBe(1);
    expect(image.cropCalls.length).toBe(1);

    // expected pixel rect: (0,0)-(50,50) on a 100×100 texture
    expect(image.cropCalls[0].rect).toEqual({
      left: 0, top: 0, width: 50, height: 50,
    });

    // baseColor result returns the crop bytes verbatim
    expect(Array.from(result.baseColorPng)).toEqual([0xFF, 0xFE, 0xFD]);
    expect(result.baseColorSize).toEqual({ width: 50, height: 50 });

    // UVs were remapped to fill [0,1]: (0,0)/(0.5,0)/(0.5,0.5)/(0,0.5) →
    // (0,0)/(1,0)/(1,1)/(0,1)
    const acc = doc.getRoot().listMeshes()[0].listPrimitives()[0]
      .getAttribute("TEXCOORD_0")!;
    expect(Array.from(acc.getArray()!)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  });

  it("re-throws ValidationError from validate() before doing image work", async () => {
    // Build a multi-material doc to trigger validate failure
    const doc = buildSingleMaterialDoc();
    const mat2 = doc.createMaterial("M2");
    const acc = doc.createAccessor()
      .setType("VEC2")
      .setArray(new Float32Array([0, 0]));
    const prim2 = doc.createPrimitive().setMaterial(mat2).setAttribute("TEXCOORD_0", acc);
    doc.createMesh("Mesh2").addPrimitive(prim2);

    const image = makeMockImageOps();

    await expect(runCore({ doc, image })).rejects.toThrow(/Multiple materials/);
    // image port was never called (validate failed first)
    expect(image.probeCalls).toBe(0);
    expect(image.cropCalls.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run, see it fail**

Run: `npx vitest run tests/unit/core/pipeline-core.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `src/core/pipeline-core.ts`:

```ts
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
```

- [ ] **Step 4: Run, see it pass**

Run: `npx vitest run tests/unit/core/pipeline-core.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: all previous + 2 new = 21 passing.

- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline-core.ts tests/unit/core/pipeline-core.test.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(core/pipeline-core): orchestrate validate → bbox → crop → remap

Adapter-agnostic pipeline that takes a pre-loaded Document and an
ImageOps port, mutates UVs and textures in place, and returns the
baseColor PNG plus aux data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Add `src/node/image-sharp.ts` (Node ImageOps)

**Files:**
- Create: `src/node/image-sharp.ts`

Thin wrapper around `sharp`. No isolated unit test — exercised by the existing integration test in Task 9.

- [ ] **Step 1: Write the file**

```ts
// src/node/image-sharp.ts
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
};
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/node/image-sharp.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(node/image-sharp): ImageOps via sharp

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Add `src/node/zip-archiver.ts` (Node ZipOps)

**Files:**
- Create: `src/node/zip-archiver.ts`

Replaces the file-based `pack-zip.ts` with a bytes-based ZipOps. The wrapper writes the bytes to disk separately.

- [ ] **Step 1: Write the file**

```ts
// src/node/zip-archiver.ts
import { Writable } from "node:stream";
import archiver from "archiver";
import type { ZipOps } from "../ports.js";

export const nodeZipOps: ZipOps = {
  async pack(files) {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    });

    await new Promise<void>((resolve, reject) => {
      const archive = archiver("zip", { zlib: { level: 9 } });
      sink.on("finish", () => resolve());
      sink.on("error", reject);
      archive.on("error", reject);
      archive.pipe(sink);
      for (const f of files) {
        archive.append(Buffer.from(f.bytes), { name: f.name });
      }
      archive.finalize();
    });

    return new Uint8Array(Buffer.concat(chunks));
  },
};
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/node/zip-archiver.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(node/zip-archiver): ZipOps via archiver (bytes-out)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Add `src/node/glb-io.ts`

**Files:**
- Create: `src/node/glb-io.ts`

Path-based read (preserves external texture resolution) and binary write.

- [ ] **Step 1: Write the file**

```ts
// src/node/glb-io.ts
import { NodeIO } from "@gltf-transform/core";
import type { Document } from "@gltf-transform/core";

const io = new NodeIO();

export async function readGlbFromPath(path: string): Promise<Document> {
  return io.read(path);
}

export async function writeGlbToBytes(doc: Document): Promise<Uint8Array> {
  return io.writeBinary(doc);
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/node/glb-io.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(node/glb-io): NodeIO read/write helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Add `src/node/pipeline.ts` and `src/node/index.ts`

**Files:**
- Create: `src/node/pipeline.ts`
- Create: `src/node/index.ts`

`runPipeline` preserves the v0.1 signature exactly: takes paths, writes files, optionally zips.

- [ ] **Step 1: Write `src/node/pipeline.ts`**

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
  outputs: { glb: string; png: string; zip: string | null };
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const stem = basename(opts.inputPath, extname(opts.inputPath));
  const outGlbPath = join(opts.outputDir, `${stem}.glb`);
  const outPngPath = join(opts.outputDir, `${stem}.png`);
  const outZipPath = join(opts.outputDir, `${stem}.zip`);

  const doc = await readGlbFromPath(opts.inputPath);
  const result = await runCore({ doc, image: nodeImageOps });
  const outGlbBytes = await writeGlbToBytes(doc);

  await writeFile(outGlbPath, outGlbBytes);
  await writeFile(outPngPath, result.baseColorPng);

  let zipPath: string | null = null;
  if (opts.zip) {
    const zipBytes = await nodeZipOps.pack([
      { name: `${stem}.glb`, bytes: outGlbBytes },
      { name: `${stem}.png`, bytes: result.baseColorPng },
    ]);
    await writeFile(outZipPath, zipBytes);
    zipPath = outZipPath;
  }

  return {
    bbox: result.bbox,
    baseColorSize: result.baseColorSize,
    outputs: { glb: outGlbPath, png: outPngPath, zip: zipPath },
  };
}
```

- [ ] **Step 2: Write `src/node/index.ts`**

```ts
export { runPipeline } from "./pipeline.js";
export type { PipelineOptions, PipelineResult } from "./pipeline.js";
export { ValidationError } from "../core/errors.js";
export type { UvBbox } from "../core/uv-bbox.js";
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/node/pipeline.ts src/node/index.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(node): runPipeline wrapper + public index

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Reroute `cli.ts`, delete old top-level src files, verify integration

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/integration/pipeline.test.ts`
- Delete: `src/load.ts`, `src/crop-textures.ts`, `src/write-glb.ts`, `src/write-png.ts`, `src/pack-zip.ts`, `src/pipeline.ts`

This is the cutover from old layout to new. After this task, src/ has only `cli.ts`, `ports.ts`, `core/`, and `node/`.

- [ ] **Step 1: Update `src/cli.ts` imports**

Change:

```ts
// before
import { runPipeline } from "./pipeline.js";
import { ValidationError } from "./core/errors.js";
// after
import { runPipeline, ValidationError } from "./node/index.js";
```

(Everything else in `cli.ts` stays the same.)

- [ ] **Step 2: Update integration test import**

In `tests/integration/pipeline.test.ts`, change:

```ts
// before
import { runPipeline } from "../../src/pipeline.js";
// after
import { runPipeline } from "../../src/node/index.js";
```

- [ ] **Step 3: Delete the obsolete top-level files**

```bash
git rm src/load.ts src/crop-textures.ts src/write-glb.ts src/write-png.ts src/pack-zip.ts src/pipeline.ts
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: 21 tests pass (19 carried over + 2 new core tests). Integration test verifies the new Node code path against the real `JerseyBarrierB.glb`.

- [ ] **Step 5: Build + CLI smoke**

Run: `npm run build && node dist/cli.js JerseyBarrierB`
Expected: prints success lines, writes `outputs/JerseyBarrierB.{glb,png,zip}` (overwriting any prior outputs).

- [ ] **Step 6: Commit**

```bash
git add -A
git -c user.email=dev@concode.co -c user.name=dev commit -m "refactor(node): switch CLI to new node/ layout; delete obsolete src/ files

cli.ts and the integration test now import from src/node/index.ts.
The old top-level src/load.ts, crop-textures.ts, write-glb.ts,
write-png.ts, pack-zip.ts, and pipeline.ts have been deleted —
their behavior lives in core/pipeline-core.ts and node/* now.

19 unit + 2 new core unit + 1 integration tests pass. CLI smoke
test against JerseyBarrierB.glb produces identical outputs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Add `fflate`, `happy-dom`, `canvas` dev dependencies; configure vitest envs

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`

The web tests need a DOM environment (happy-dom) and a real canvas implementation (`canvas` package — Node binding to native cairo).

- [ ] **Step 1: Install dependencies**

```bash
npm install fflate@^0.8.2
npm install --save-dev happy-dom@^15.0.0 canvas@^2.11.2
```

- [ ] **Step 2: Configure vitest environments per glob**

Update `vitest.config.ts` to:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    passWithNoTests: true,
    environmentMatchGlobs: [
      ["tests/unit/web/**", "happy-dom"],
      ["tests/integration/web-pipeline.test.ts", "happy-dom"],
    ],
  },
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: existing 21 tests still pass. (No new tests yet; deps are present.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "chore(deps): add fflate (runtime), happy-dom + canvas (dev), env matching

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Add `src/web/zip-fflate.ts` + unit test

**Files:**
- Create: `src/web/zip-fflate.ts`
- Test: `tests/unit/web/zip-fflate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/web/zip-fflate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import { webZipOps } from "../../../src/web/zip-fflate.js";

describe("webZipOps", () => {
  it("packs a list of files into a zip that round-trips", async () => {
    const a = new TextEncoder().encode("hello");
    const b = new TextEncoder().encode("world");
    const zipped = await webZipOps.pack([
      { name: "a.txt", bytes: a },
      { name: "b.txt", bytes: b },
    ]);
    expect(zipped.length).toBeGreaterThan(0);

    const unzipped = unzipSync(zipped);
    expect(new TextDecoder().decode(unzipped["a.txt"])).toBe("hello");
    expect(new TextDecoder().decode(unzipped["b.txt"])).toBe("world");
  });

  it("handles an empty file list (produces a valid empty zip)", async () => {
    const zipped = await webZipOps.pack([]);
    expect(zipped.length).toBeGreaterThan(0);
    expect(unzipSync(zipped)).toEqual({});
  });
});
```

- [ ] **Step 2: Run, see it fail**

Run: `npx vitest run tests/unit/web/zip-fflate.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `src/web/zip-fflate.ts`:

```ts
import { zip } from "fflate";
import type { ZipOps } from "../ports.js";

export const webZipOps: ZipOps = {
  pack(files) {
    const entries: Record<string, Uint8Array> = {};
    for (const f of files) {
      entries[f.name] = f.bytes;
    }
    return new Promise<Uint8Array>((resolve, reject) => {
      zip(entries, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  },
};
```

- [ ] **Step 4: Run, see it pass**

Run: `npx vitest run tests/unit/web/zip-fflate.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/web/zip-fflate.ts tests/unit/web/zip-fflate.test.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(web/zip-fflate): ZipOps via fflate

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Add `src/web/image-canvas.ts` (Canvas2D ImageOps)

**Files:**
- Create: `src/web/image-canvas.ts`

No isolated unit test — covered by the integration test in Task 14 (which exercises the real Canvas2D code path under happy-dom + canvas package).

- [ ] **Step 1: Write the file**

```ts
// src/web/image-canvas.ts
import type { ImageOps } from "../ports.js";

async function loadImage(buf: Uint8Array): Promise<HTMLImageElement> {
  const blob = new Blob([buf]);
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
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: clean. (Uses DOM globals — make sure `tsconfig.json` includes `lib: ["ES2022", "DOM"]` if missing. If tsc complains about `HTMLImageElement` / `Image` / `Blob` / `URL` being undefined, add `"lib": ["ES2022", "DOM"]` to `compilerOptions`.)

If lib needs adding, also commit it as part of this task's edit.

- [ ] **Step 3: Commit**

```bash
git add src/web/image-canvas.ts tsconfig.json
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(web/image-canvas): ImageOps via Canvas2D

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Add `src/web/glb-io.ts`

**Files:**
- Create: `src/web/glb-io.ts`

Bytes-based read (browser has no filesystem) and write.

- [ ] **Step 1: Write the file**

```ts
// src/web/glb-io.ts
import { NodeIO } from "@gltf-transform/core";
import type { Document } from "@gltf-transform/core";

// NodeIO works fine in browsers when used in pure-bytes mode (readBinary/writeBinary).
// It does not touch the filesystem in this code path.
const io = new NodeIO();

export async function readGlbFromBytes(bytes: Uint8Array): Promise<Document> {
  return io.readBinary(bytes);
}

export async function writeGlbToBytes(doc: Document): Promise<Uint8Array> {
  return io.writeBinary(doc);
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/web/glb-io.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(web/glb-io): bytes-based read/write via NodeIO.readBinary

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Add `src/web/pipeline.ts`, `src/web/index.ts`, integration test

**Files:**
- Create: `src/web/pipeline.ts`
- Create: `src/web/index.ts`
- Test: `tests/integration/web-pipeline.test.ts`

This is the public Web API. The integration test runs in happy-dom + canvas environment, loads the same `JerseyBarrierB.glb` fixture as bytes, runs `runPack`, and asserts UVs ∈ [0,1] and a non-empty PNG.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/web-pipeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { runPack, ValidationError } from "../../src/web/index.js";

const FIXTURE = resolve("tests/fixtures/JerseyBarrierB.glb");

describe("runPack (web integration)", () => {
  it("packs the JerseyBarrier model end-to-end from bytes", async () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE));
    const result = await runPack(bytes, { filename: "test", zip: true });

    // 1. All output bytes are present and non-empty
    expect(result.glbBytes.byteLength).toBeGreaterThan(0);
    expect(result.baseColorPng.byteLength).toBeGreaterThan(0);
    expect(result.zipBytes).not.toBeNull();
    expect(result.zipBytes!.byteLength).toBeGreaterThan(0);

    // 2. baseColorSize is plausible (bbox is ~66%×47% of original 128×128 → ~85×60)
    expect(result.baseColorSize.width).toBeGreaterThan(0);
    expect(result.baseColorSize.height).toBeGreaterThan(0);

    // 3. The output GLB parses, and every UV is in [0,1]
    const io = new NodeIO();
    const out = await io.readBinary(result.glbBytes);
    let outMin = Infinity;
    let outMax = -Infinity;
    for (const mesh of out.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const arr = prim.getAttribute("TEXCOORD_0")?.getArray();
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] < outMin) outMin = arr[i];
          if (arr[i] > outMax) outMax = arr[i];
        }
      }
    }
    expect(outMin).toBeGreaterThanOrEqual(-1e-5);
    expect(outMax).toBeLessThanOrEqual(1 + 1e-5);
  });

  it("re-throws ValidationError for an OOB-UV input", async () => {
    // Build a minimal in-memory GLB whose UVs exceed [0,1]
    const io = new NodeIO();
    const { Document } = await import("@gltf-transform/core");
    const doc = new Document();
    doc.createBuffer();
    const tex = doc.createTexture("base").setImage(new Uint8Array([0])).setMimeType("image/png");
    const mat = doc.createMaterial("M").setBaseColorTexture(tex);
    const acc = doc.createAccessor()
      .setType("VEC2")
      .setArray(new Float32Array([0, 0, 1.5, 0, 1, 1, 0, 1]));
    const prim = doc.createPrimitive().setMaterial(mat).setAttribute("TEXCOORD_0", acc);
    doc.createMesh("Mesh1").addPrimitive(prim);
    const badBytes = await io.writeBinary(doc);

    await expect(runPack(new Uint8Array(badBytes))).rejects.toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run, see it fail**

Run: `npx vitest run tests/integration/web-pipeline.test.ts`
Expected: module-not-found (`runPack` not yet exported).

- [ ] **Step 3: Write `src/web/pipeline.ts`**

```ts
// src/web/pipeline.ts
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
    ]);
  }

  return {
    glbBytes: outGlbBytes,
    baseColorPng: result.baseColorPng,
    zipBytes,
    bbox: result.bbox,
    baseColorSize: result.baseColorSize,
  };
}
```

- [ ] **Step 4: Write `src/web/index.ts`**

```ts
export { runPack } from "./pipeline.js";
export type { PackOptions, PackResult } from "./pipeline.js";
export { ValidationError } from "../core/errors.js";
export type { UvBbox } from "../core/uv-bbox.js";
```

- [ ] **Step 5: Run integration test**

Run: `npx vitest run tests/integration/web-pipeline.test.ts`
Expected: 2 passing.

If you encounter issues with `Image` / `URL.createObjectURL` / `canvas.toBlob` in happy-dom: the `canvas` npm package should provide what's needed. If it does not (e.g., `toBlob` returns null), document the issue and try setting `globalThis.HTMLCanvasElement.prototype.toBlob` to a polyfill that uses `canvas`'s `toBuffer`. Report as DONE_WITH_CONCERNS if the test cannot be made green and we'll regroup.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: all previous + 2 new web integration = 25 passing.

- [ ] **Step 7: Commit**

```bash
git add src/web/pipeline.ts src/web/index.ts tests/integration/web-pipeline.test.ts
git -c user.email=dev@concode.co -c user.name=dev commit -m "feat(web): runPack public API + integration test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Update `package.json` (exports, sideEffects, version)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Apply edits**

Set the following fields in `package.json`:

```json
{
  "name": "glb-pack",
  "version": "0.2.0",
  "description": "Crop unused texture space and remap UVs in a GLB (Node + Browser)",
  "type": "module",
  "license": "MIT",
  "author": "concode <dev@concode.co>",
  "homepage": "https://github.com/mjshin82/glb-pack#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/mjshin82/glb-pack.git"
  },
  "bugs": {
    "url": "https://github.com/mjshin82/glb-pack/issues"
  },
  "keywords": [
    "glb",
    "gltf",
    "texture",
    "uv",
    "atlas",
    "pack",
    "crop",
    "3d",
    "cli",
    "browser"
  ],
  "sideEffects": false,
  "exports": {
    ".":     { "types": "./dist/node/index.d.ts", "default": "./dist/node/index.js" },
    "./web": { "types": "./dist/web/index.d.ts",  "default": "./dist/web/index.js" }
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "bin": { "glb-pack": "dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepare": "npm run build",
    "prepublishOnly": "npm test && npm run build"
  },
  "dependencies": {
    "@gltf-transform/core": "^4.1.0",
    "archiver": "^7.0.1",
    "fflate": "^0.8.2",
    "sharp": "^0.33.5"
  },
  "devDependencies": {
    "@types/archiver": "^6.0.2",
    "@types/node": "^20.14.0",
    "canvas": "^2.11.2",
    "happy-dom": "^15.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "engines": { "node": ">=20" }
}
```

(`description` updated to mention browser; `keywords` adds `browser`; `exports` adds the sub-export; `sideEffects: false` enables tree-shaking; `version` bumped.)

Also add `tsconfig.json` declaration generation so `.d.ts` files exist under `dist/node` and `dist/web`:

In `tsconfig.json`, set `"declaration": true` (currently `false`).

- [ ] **Step 2: Build and verify dist tree**

Run: `npm run build && find dist -type f | sort`
Expected (a subset):
```
dist/cli.js
dist/cli.js.map
dist/cli.d.ts
dist/core/bbox-to-rect.js
dist/core/bbox-to-rect.d.ts
dist/core/errors.js
...
dist/node/index.js
dist/node/index.d.ts
dist/node/pipeline.js
...
dist/web/index.js
dist/web/index.d.ts
dist/web/pipeline.js
...
```

- [ ] **Step 3: Dry-run publish**

Run: `npm publish --dry-run 2>&1 | tail -40`
Expected: tarball includes `dist/node/`, `dist/web/`, `dist/core/`, `dist/cli.js`, `LICENSE`, `README.md`, `package.json`. No `src/`, no `tests/`, no `models/`, no `outputs/`.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: all 25 tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json
git -c user.email=dev@concode.co -c user.name=dev commit -m "chore(release): v0.2.0 — add glb-pack/web sub-export

- exports field adds the ./web entry
- sideEffects: false enables browser tree-shaking
- declaration: true for .d.ts files
- version bumped to 0.2.0

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Update README — Browser Usage section + final commit

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Browser Usage section after the Node Usage section**

Insert this section (place after the "Usage" heading's existing content, before "V1 supported / not supported"):

```markdown
## Browser Usage

`glb-pack` also runs entirely in the browser — no server, no Node.js. The same
crop+remap algorithm runs via Canvas2D (image work) and `fflate` (zip).

```ts
import { runPack, ValidationError } from "glb-pack/web";

// drag-dropped or <input type="file"> File
const file: File = /* ... */;
const glbBytes = new Uint8Array(await file.arrayBuffer());

try {
  const result = await runPack(glbBytes, {
    filename: "model",  // optional; used as the stem inside the zip
    zip: true,          // optional; default true
  });
  // result.glbBytes      — Uint8Array, the new GLB
  // result.baseColorPng  — Uint8Array, the cropped baseColor PNG
  // result.zipBytes      — Uint8Array | null
  // result.bbox          — { uMin, vMin, uMax, vMax }
  // result.baseColorSize — { width, height }
} catch (err) {
  if (err instanceof ValidationError) {
    // user-facing message (e.g., "Multiple materials...")
  } else {
    throw err;
  }
}
```

Browser support: Chrome 91+, Firefox 90+, Safari 15+, Edge 91+.

The library never triggers a download — your app does that:

```ts
const blob = new Blob([result.zipBytes!], { type: "application/zip" });
const url = URL.createObjectURL(blob);
const a = Object.assign(document.createElement("a"), { href: url, download: "packed.zip" });
a.click();
URL.revokeObjectURL(url);
```
```

(Replace ``` blocks correctly when editing — the outer fences are the README's, the inner ones delimit code.)

Also update the "## Install" section to mention both runtime targets are supported:

Find:
```
From npm (recommended):

    npm install -g glb-pack
```

Add right after that block:

```
For browser/library use (no global install needed):

    npm install glb-pack
    # then: import { runPack } from "glb-pack/web"
```

- [ ] **Step 2: Verify rendering on github (visual check)**

This step is informational — after committing and pushing, visit https://github.com/mjshin82/glb-pack and confirm the README renders correctly.

- [ ] **Step 3: Commit**

```bash
git add README.md
git -c user.email=dev@concode.co -c user.name=dev commit -m "docs: add Browser Usage section for glb-pack/web

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Push to origin and publish**

```bash
git push origin main
npm publish    # 2FA OTP via Touch ID
```

Expected: github push succeeds, npm publish prints `+ glb-pack@0.2.0`.

---

## Self-Review Notes

**Spec coverage:**
- Distribution shape (sub-export `glb-pack/web`) ✓ Tasks 8, 14, 15
- Hexagonal architecture (core / node / web) ✓ Tasks 1–14
- Port interfaces (ImageOps, ZipOps) ✓ Task 2
- Browser deps (fflate, Canvas2D, no native) ✓ Tasks 10–14
- Public API stability (Node `runPipeline` unchanged) ✓ Task 8 keeps signature
- Browser support floor (Chrome 91+ / FF 90+ / Safari 15+) ✓ documented in README (Task 16)
- Migration tests (existing tests pass after each stage) ✓ Tasks 1, 4, 9, 14
- ValidationError re-export from both adapter index files ✓ Tasks 8, 14
- New tests for bbox-to-rect, pipeline-core (mock adapters), zip-fflate, web pipeline integration ✓ Tasks 3, 4, 11, 14
- Plan-level deviation (GltfIO removed; runCore takes Document) ✓ documented at top

**Type/name consistency:**
- `ImageOps` defined Task 2, used Tasks 4, 5, 12.
- `ZipOps` defined Task 2, used Tasks 6, 11.
- `UvBbox` (carried from v0.1) used in Tasks 3, 4, 8, 14.
- `PixelRect` defined Task 3, used Task 4 (typed via `bboxToPixelRect` return).
- `runCore`/`CoreInputs`/`CoreResult` defined Task 4, used Tasks 8, 14.
- `runPipeline`/`PipelineOptions`/`PipelineResult` (Node) defined Task 8.
- `runPack`/`PackOptions`/`PackResult` (Web) defined Task 14.
- All `src/*.js` import paths use `.js` extension as required by NodeNext.
- `ValidationError` lives in `src/core/errors.ts`, re-exported from `src/node/index.ts` and `src/web/index.ts`.

**Known risk (flagged for execution):**
- Task 14 step 5 — happy-dom + canvas integration may have rough edges (e.g., `toBlob` returning null). The plan documents the most likely fallback (use `canvas`'s `toBuffer` to polyfill `toBlob`). If this becomes a hard blocker, the implementer should report DONE_WITH_CONCERNS so we can decide whether to switch to a Playwright-based browser test or accept the limitation in v0.2 and ship.
