# glb-pack v0.2 — Browser Support via `glb-pack/web` Sub-export

**Date:** 2026-05-08
**Status:** Design approved
**Target version:** 0.2.0

## Purpose

Refactor `glb-pack` so the same texture-bbox-crop algorithm runs in two environments:

- **Node** (existing): file path in, file path out, exposed as `glb-pack` CLI and `import { runPipeline } from "glb-pack"`.
- **Browser** (new): bytes in, bytes out, exposed as `import { runPack } from "glb-pack/web"`. No native dependencies.

The downstream "drag-drop GLB on a webpage and download a zip" use case lives in a **separate project** outside this repository. This work delivers only the library refactor + npm publish at v0.2.0.

## Key Decisions (Approved)

1. **Distribution shape:** Single npm package with sub-export. Node continues at the package root; browser API at `glb-pack/web`. CLI unchanged.
2. **Architecture:** Hexagonal-style — `src/core/` holds environment-agnostic logic and depends on a small set of port interfaces (`src/ports.ts`); `src/node/` and `src/web/` provide the adapter implementations.
3. **Browser deps (new):** `fflate` for zip generation (~8 KB minzipped). Image cropping uses native Canvas2D (zero deps). glTF IO uses `WebIO` from the existing `@gltf-transform/core`.
4. **Public API stability:** Existing Node API (`runPipeline`, `ValidationError`, CLI) preserves its v0.1 signatures. v0.2 is a minor bump.
5. **Browser support floor:** Chrome 91+, Firefox 90+, Safari 15+, Edge 91+ (2021+).

## File Structure (target)

```
src/
├─ core/                   # No environment dependencies. Imports only ports.ts.
│  ├─ errors.ts
│  ├─ uv-bbox.ts
│  ├─ remap-uv.ts
│  ├─ validate.ts
│  └─ pipeline-core.ts    # validate + bbox + crop-via-port + remap (no IO, no zip)
│
├─ ports.ts               # ImageOps, ZipOps, GltfIO interfaces
│
├─ node/
│  ├─ image-sharp.ts
│  ├─ zip-archiver.ts
│  ├─ gltf-node-io.ts
│  ├─ pipeline.ts         # path-in/path-out, calls pipeline-core + writes files + zip
│  └─ index.ts            # { runPipeline, ValidationError, ... }
│
├─ web/
│  ├─ image-canvas.ts
│  ├─ zip-fflate.ts
│  ├─ gltf-web-io.ts
│  ├─ pipeline.ts         # bytes-in/bytes-out, calls pipeline-core + zips bytes
│  └─ index.ts            # { runPack, ValidationError, ... }
│
└─ cli.ts                 # Imports only src/node/index.ts
```

## Port Interfaces (`src/ports.ts`)

```ts
export interface ImageOps {
  readonly probe: (buf: Uint8Array) => Promise<{ width: number; height: number }>;
  readonly cropToPng: (
    buf: Uint8Array,
    rect: { left: number; top: number; width: number; height: number },
  ) => Promise<Uint8Array>;
}

export interface ZipOps {
  readonly pack: (
    files: ReadonlyArray<{ name: string; bytes: Uint8Array }>,
  ) => Promise<Uint8Array>;
}

export interface GltfIO {
  readonly read: (bytes: Uint8Array) => Promise<import("@gltf-transform/core").Document>;
  readonly write: (doc: import("@gltf-transform/core").Document) => Promise<Uint8Array>;
}
```

## Core Pipeline Signature (`src/core/pipeline-core.ts`)

```ts
export interface CoreInputs {
  glbBytes: Uint8Array;
  image: ImageOps;
  gltfIO: GltfIO;
}

export interface CoreResult {
  outGlbBytes: Uint8Array;
  baseColorPng: Uint8Array;
  bbox: UvBbox;
  baseColorSize: { width: number; height: number };
}

export async function runCore(inputs: CoreInputs): Promise<CoreResult>;
```

`runCore` does: read → validate → compute bbox → crop every texture in place via `image` port → remap every unique UV accessor → write GLB to bytes via `gltfIO`. Zip is left to the wrapper because it's optional and adapter-specific.

## Public APIs

### Node (unchanged, preserved exactly)

```ts
import { runPipeline } from "glb-pack";

await runPipeline({
  inputPath: "models/foo.glb",
  outputDir: "outputs",
  zip: true,
});
```

CLI: `glb-pack <name>` continues identically.

### Browser (new)

```ts
import { runPack } from "glb-pack/web";

const file: File = /* drag-dropped */;
const glbBytes = new Uint8Array(await file.arrayBuffer());

const result = await runPack(glbBytes, {
  filename: "foo",   // optional, used for zip entry stems; default "model"
  zip: true,
});
// result: {
//   glbBytes:      Uint8Array,
//   baseColorPng:  Uint8Array,
//   zipBytes:      Uint8Array | null,
//   bbox:          UvBbox,
//   baseColorSize: { width, height },
// }
```

`ValidationError` flows through unchanged — apps should `catch (err) if (err instanceof ValidationError)` to surface user-facing messages.

The library never triggers downloads itself — that's the application's responsibility (Blob, `URL.createObjectURL`, anchor click, etc.).

## New Dependency

| Package | Purpose | Size | License |
|---|---|---|---|
| `fflate` | Browser zip | ~8 KB minzipped | MIT |

`sharp` and `archiver` remain Node-only and never get bundled into the `/web` entry. `package.json` will set `"sideEffects": false` to ensure tree-shaking removes them from browser bundles.

## `package.json` changes

```json
{
  "version": "0.2.0",
  "dependencies": {
    "@gltf-transform/core": "^4.1.0",
    "archiver": "^7.0.1",
    "sharp": "^0.33.5",
    "fflate": "^0.8.2"
  },
  "exports": {
    ".":     { "types": "./dist/node/index.d.ts", "default": "./dist/node/index.js" },
    "./web": { "types": "./dist/web/index.d.ts",  "default": "./dist/web/index.js" }
  },
  "bin":          { "glb-pack": "dist/cli.js" },
  "sideEffects":  false
}
```

`tsconfig.json` keeps `rootDir: src`, `outDir: dist`. The dist tree mirrors src: `dist/core/`, `dist/node/`, `dist/web/`, `dist/cli.js`.

## Browser Compatibility

- **Canvas2D + drawImage** — ~96% global support (caniuse).
- **`Image()` + `URL.createObjectURL`** — ~98%.
- **WebIO from `@gltf-transform/core` 4.x** — ESM ES2022, requires Chrome 91+, Firefox 90+, Safari 15+.
- **fflate** — modern browsers and IE 11+.

Effective floor: **Chrome 91+ / Firefox 90+ / Safari 15+ / Edge 91+** (2021+).

## Migration / Backward Compat

- Public Node API: **no breaking changes**. v0.2 is a minor bump.
- `import { runPipeline } from "glb-pack"` — same signature, same behavior.
- `import { ValidationError } from "glb-pack"` — same; the class moves to `src/core/errors.ts` internally and is re-exported from both adapter `index.ts` files.
- CLI: identical behavior; internal `cli.ts` reroutes through `node/index.ts`.

## Testing Strategy

**Existing tests carried over without behavior changes:**
- `tests/unit/uv-bbox.test.ts` — imports relocate to `core/`, expectations unchanged.
- `tests/unit/remap-uv.test.ts` — same.
- `tests/unit/validate.test.ts` — same.
- `tests/integration/pipeline.test.ts` — Node entry; tests `runPipeline` end-to-end on `tests/fixtures/JerseyBarrierB.glb`.

**New tests:**
- `tests/unit/web/zip-fflate.test.ts` — verify fflate ZipOps round-trips a small file list.
- `tests/unit/web/image-canvas.test.ts` — happy-dom environment + canvas mock (or `node-canvas` polyfill); verify probe + crop on a known PNG.
- `tests/unit/core/pipeline-core.test.ts` — uses an in-memory mock `ImageOps`/`GltfIO` to exercise the orchestration without environment deps.
- `tests/integration/web-pipeline.test.ts` — happy-dom env: load fixture bytes, call `runPack`, assert resulting bytes parse as a valid GLB with UVs ∈ [0,1] and a non-empty PNG.

Vitest config gains a per-pattern environment override:
```ts
{
  test: {
    include: ["tests/**/*.test.ts"],
    environmentMatchGlobs: [["tests/**/web/**", "happy-dom"]],
    testTimeout: 20000,
  },
}
```

`happy-dom` will be added as a devDependency.

## Stage-by-Stage Migration Plan

Each stage is an independent commit. Tests must pass after each stage.

| Stage | What | Test gate |
|---|---|---|
| 1 | Move pure modules into `src/core/` (errors, uv-bbox, remap-uv, validate). Update import paths. | All existing tests pass unchanged. |
| 2 | Add `src/ports.ts` (interface only, no implementations). | tsc clean. |
| 3 | Extract `src/core/pipeline-core.ts` from existing `pipeline.ts`. Add unit test with mock adapters. | New core test passes; existing tests still pass. |
| 4 | Move existing texture-crop, IO, zip code into `src/node/` adapters. Re-route `cli.ts`. Add `src/node/index.ts`. | Existing integration test passes unchanged. |
| 5 | Add `src/web/` adapters + `runPack` wrapper. Add web unit + integration tests. Add `fflate`, `happy-dom` deps. | New web tests pass. |
| 6 | Update `package.json` (exports, sideEffects, version 0.2.0, fflate). Verify `npm publish --dry-run` shows both entries. | dry-run shows expected dist tree. |
| 7 | README "Browser usage" section. Bump version. | — |

## Out of Scope (V2 boundaries)

- The downstream web app/page — separate project.
- Web Worker / OffscreenCanvas — V1 web pipeline runs on the main thread. Workers are a follow-up if perf becomes an issue.
- Streaming or progress callbacks — `runPack` is a single async call. Apps can wrap it in their own progress UI.
- Image format support beyond PNG/JPEG — KTX2 and other GPU-compressed formats remain unsupported (Canvas2D would not decode them anyway).

## Future Improvements (V3+)

- OffscreenCanvas + Worker offload for large textures.
- Progress callbacks (`onStage: (stage, percent) => void`).
- Multi-file batch in the web API (`runPackBatch(files[])`).
- Optional padding parameter (`runPack(bytes, { padding: 4 })`).
