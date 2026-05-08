# glb-pack

Crop unused texture space out of a GLB and remap its UVs to the new 0–1 range. Useful when an external 3D tool exports models whose textures have a lot of empty space, wasting GPU memory and download size.

## What it does

```
input  : models/<name>.glb        (texture has lots of empty space)
output : outputs/<name>.glb       (UVs remapped, all textures cropped + embedded)
         outputs/<name>.png       (cropped baseColor texture, separate file)
         outputs/<name>.zip       (the .glb + .png, flat zipped)
```

The tool computes the smallest axis-aligned UV bounding box across every primitive, crops every texture (baseColor, normal, ORM, emissive…) to that pixel rectangle, and rewrites the UVs into the new `[0, 1]` space.

## Install

From npm (recommended):

```bash
npm install -g glb-pack
```

Or from source:

```bash
git clone https://github.com/mjshin82/glb-pack.git
cd glb-pack
npm install
npm install -g .
```

Requires Node ≥ 20.

## Usage

```bash
# Read models/JerseyBarrierB.glb, write outputs/JerseyBarrierB.{glb,png,zip}
glb-pack JerseyBarrierB

# Read any path directly
glb-pack ./somewhere/else/foo.glb

# Skip the .zip
glb-pack JerseyBarrierB --no-zip
```

Example output:

```
✓ Loaded models/JerseyBarrierB.glb
✓ UV bbox: [0.00, 0.00] – [0.66, 0.47]
✓ baseColor cropped to 84×60
✓ Wrote outputs/JerseyBarrierB.glb
✓ Wrote outputs/JerseyBarrierB.png
✓ Wrote outputs/JerseyBarrierB.zip
```

## V1 supported / not supported

This is a V1 release with a deliberately narrow scope.

**Supported:**

- A single material across the whole model (multiple meshes / primitives are fine if they all share that one material)
- Every PBR texture slot on that material (baseColor / normal / ORM / emissive — all cropped together with the same UV bbox)
- UVs in `[0, 1]`
- Textures embedded in the GLB or referenced as external files next to it (resolved automatically)

**Not supported (the tool aborts with a clear error):**

- Multiple distinct materials
- Wrap / repeat UVs (any UV outside `[0, 1]`)
- Non-finite UV values (NaN, ±∞)
- A second UV channel (`TEXCOORD_1`)

## How it works

1. Load the GLB.
2. Validate the model meets the V1 constraints above.
3. Compute the UV bounding box over every primitive's `TEXCOORD_0`.
4. Crop every texture in the document by `bbox × textureSize` (per texture, since resolutions can differ). Outward rounding (`floor` for min, `ceil` for max) preserves full UV coverage.
5. Remap each unique UV accessor with `(u − uMin) / (uMax − uMin)`.
6. Write the new GLB (textures embedded), a separate baseColor PNG, and a flat zip.

No padding is added at the bbox boundary — keep this in mind if your engine relies on aggressive mip filtering.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Validation failed (model violates V1 constraints — message describes what) |
| 2 | I/O error (input not found, write failed, etc.) |

## Development

```bash
npm run dev <name>      # Run via tsx (no build step)
npm run build           # Compile TypeScript to dist/
npm test                # Run unit + integration tests (vitest)
```

Project structure:

```
src/
├─ cli.ts             # argv → pipeline → exit code
├─ pipeline.ts        # orchestration
├─ load.ts            # NodeIO.read wrapper
├─ validate.ts        # single-material / UV ∈ [0,1] / no TEXCOORD_1
├─ uv-bbox.ts         # pure: UV arrays → bbox
├─ remap-uv.ts        # pure: UV array + bbox → new UV array
├─ crop-textures.ts   # mutates Document textures via sharp; returns baseColor PNG
├─ write-glb.ts       # NodeIO.write wrapper
├─ write-png.ts       # fs/promises.writeFile wrapper
├─ pack-zip.ts        # archiver wrapper
└─ errors.ts          # ValidationError class

tests/
├─ unit/              # uv-bbox, remap-uv, validate
└─ integration/       # full pipeline against a real GLB fixture
```

The design and implementation plan live under [`docs/superpowers/`](docs/superpowers/).
