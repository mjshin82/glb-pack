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
