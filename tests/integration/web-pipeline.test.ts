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
