import type { Document, Mesh, Primitive } from "@gltf-transform/core";
import { ValidationError } from "./errors.js";

export function validate(doc: Document): void {
  const meshes = doc.getRoot().listMeshes();
  const prims: Array<{ mesh: Mesh; prim: Primitive }> = [];
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) prims.push({ mesh, prim });
  }
  if (prims.length === 0) {
    throw new ValidationError("No primitives in model.");
  }

  const materials = new Set(prims.map(({ prim }) => prim.getMaterial()));
  if (materials.size !== 1) {
    throw new ValidationError(
      `Multiple materials detected (got ${materials.size}). ` +
        `V1 supports single-material models only (all primitives must share one material).`,
    );
  }
  const material = [...materials][0];
  if (!material) {
    throw new ValidationError("Primitive has no material assigned.");
  }
  if (!material.getBaseColorTexture()) {
    throw new ValidationError(`No baseColor texture on material "${material.getName()}".`);
  }

  for (const { mesh, prim } of prims) {
    if (prim.getAttribute("TEXCOORD_1")) {
      throw new ValidationError(
        `Primitive of mesh "${mesh.getName()}" has TEXCOORD_1. V1 supports TEXCOORD_0 only.`,
      );
    }
    const uv = prim.getAttribute("TEXCOORD_0");
    if (!uv) {
      throw new ValidationError(
        `Primitive of mesh "${mesh.getName()}" has no TEXCOORD_0 attribute.`,
      );
    }
    const arr = uv.getArray();
    if (!arr) {
      throw new ValidationError(
        `Primitive of mesh "${mesh.getName()}" has TEXCOORD_0 but no backing data.`,
      );
    }
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (!Number.isFinite(v)) {
        throw new ValidationError(
          `Non-finite UV on primitive of mesh "${mesh.getName()}". ` +
          `Expected all TEXCOORD_0 values in [0,1].`,
        );
      }
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min < 0 || max > 1) {
      throw new ValidationError(
        `UV out of [0,1] range on primitive of mesh "${mesh.getName()}" ` +
          `(min=${min.toFixed(2)}, max=${max.toFixed(2)}). ` +
          `Wrap/repeat models are not supported.`,
      );
    }
  }
}
