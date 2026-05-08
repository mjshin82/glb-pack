import { describe, it, expect } from "vitest";
import { Document } from "@gltf-transform/core";
import { validate } from "../../src/validate.js";
import { ValidationError } from "../../src/errors.js";

interface BuildOpts {
  uvs?: number[];
  withBaseColor?: boolean;
  extraMaterial?: boolean;
  withTexcoord1?: boolean;
}

function buildDoc(opts: BuildOpts = {}): Document {
  const {
    uvs = [0, 0, 1, 0, 1, 1, 0, 1],
    withBaseColor = true,
    extraMaterial = false,
    withTexcoord1 = false,
  } = opts;

  const doc = new Document();
  doc.createBuffer();

  const tex = withBaseColor
    ? doc
        .createTexture("base")
        .setImage(new Uint8Array([0]))
        .setMimeType("image/png")
    : null;

  const mat = doc.createMaterial("M");
  if (tex) mat.setBaseColorTexture(tex);

  const acc = doc
    .createAccessor()
    .setType("VEC2")
    .setArray(new Float32Array(uvs));

  const prim = doc.createPrimitive().setMaterial(mat).setAttribute("TEXCOORD_0", acc);
  if (withTexcoord1) {
    const acc2 = doc.createAccessor().setType("VEC2").setArray(new Float32Array(uvs));
    prim.setAttribute("TEXCOORD_1", acc2);
  }
  doc.createMesh("Mesh1").addPrimitive(prim);

  if (extraMaterial) {
    const mat2 = doc.createMaterial("M2");
    const acc3 = doc.createAccessor().setType("VEC2").setArray(new Float32Array(uvs));
    const prim2 = doc.createPrimitive().setMaterial(mat2).setAttribute("TEXCOORD_0", acc3);
    doc.createMesh("Mesh2").addPrimitive(prim2);
  }
  return doc;
}

describe("validate", () => {
  it("passes a single-material doc with valid UVs", () => {
    expect(() => validate(buildDoc())).not.toThrow();
  });

  it("rejects multiple distinct materials", () => {
    expect(() => validate(buildDoc({ extraMaterial: true }))).toThrow(ValidationError);
  });

  it("rejects a material with no baseColor texture", () => {
    expect(() => validate(buildDoc({ withBaseColor: false }))).toThrow(/baseColor/);
  });

  it("rejects UVs outside [0,1] (above 1)", () => {
    expect(() =>
      validate(buildDoc({ uvs: [0, 0, 1.5, 0, 1, 1, 0, 1] })),
    ).toThrow(/range/);
  });

  it("rejects negative UVs", () => {
    expect(() => validate(buildDoc({ uvs: [-0.1, 0, 1, 1] }))).toThrow(/range/);
  });

  it("rejects NaN UVs", () => {
    expect(() => validate(buildDoc({ uvs: [NaN, 0, 1, 1] }))).toThrow(/non-finite/i);
  });

  it("rejects primitives with TEXCOORD_1", () => {
    expect(() => validate(buildDoc({ withTexcoord1: true }))).toThrow(/TEXCOORD_1/);
  });

  it("accepts UVs at exactly 0 and 1 (inclusive)", () => {
    expect(() => validate(buildDoc({ uvs: [0, 0, 1, 1] }))).not.toThrow();
  });

  it("rejects a document with no primitives", () => {
    const doc = new Document();
    doc.createBuffer();
    expect(() => validate(doc)).toThrow(/No primitives/);
  });
});
