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

const FIXTURE = resolve("tests/fixtures/JerseyBarrierB.glb");
const TMP = resolve("tests/.tmp-out");

describe("pipeline (integration)", () => {
  beforeAll(async () => {
    await rm(TMP, { recursive: true, force: true });
    await mkdir(TMP, { recursive: true });
  });

  it("packs the JerseyBarrier model end-to-end", async () => {
    expect(existsSync(FIXTURE)).toBe(true);

    const result = await runPipeline({
      inputPath: FIXTURE,
      outputDir: TMP,
      zip: true,
    });

    // 1. All output files exist.
    for (const p of [result.outputs.glb, result.outputs.png, result.outputs.zip!]) {
      expect(existsSync(p)).toBe(true);
      expect((await stat(p)).size).toBeGreaterThan(0);
    }

    // 2. Output GLB has all UVs in [0, 1].
    const io = new NodeIO();
    const out = await io.read(result.outputs.glb);
    let outMin = Infinity;
    let outMax = -Infinity;
    for (const mesh of out.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const acc = prim.getAttribute("TEXCOORD_0");
        const arr = acc?.getArray();
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] < outMin) outMin = arr[i];
          if (arr[i] > outMax) outMax = arr[i];
        }
      }
    }
    expect(outMin).toBeGreaterThanOrEqual(-1e-5);
    expect(outMax).toBeLessThanOrEqual(1 + 1e-5);

    // 3. Output PNG dimensions match the recorded baseColor crop size.
    const meta = await sharp(result.outputs.png).metadata();
    expect(meta.width).toBe(result.baseColorSize.width);
    expect(meta.height).toBe(result.baseColorSize.height);

    // 4. .aseprite output exists, parses, and reports the same dimensions.
    expect(existsSync(result.outputs.aseprite)).toBe(true);
    expect((await stat(result.outputs.aseprite)).size).toBeGreaterThan(0);

    const aseBytes = await readFile(result.outputs.aseprite);
    const ase = new Aseprite(Buffer.from(aseBytes), "JerseyBarrierB.aseprite");
    ase.parse();
    expect(ase.width).toBe(result.baseColorSize.width);
    expect(ase.height).toBe(result.baseColorSize.height);
    expect(ase.layers[0].name).toBe("baseColor");

    // 5. The zip contains the .aseprite entry.
    const zipBytes = await readFile(result.outputs.zip!);
    const entries = unzipSync(new Uint8Array(zipBytes));
    expect(Object.keys(entries)).toContain("JerseyBarrierB.aseprite");
    expect(entries["JerseyBarrierB.aseprite"].length).toBeGreaterThan(0);
  });
});
