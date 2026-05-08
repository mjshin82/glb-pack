import { NodeIO } from "@gltf-transform/core";
import type { Document } from "@gltf-transform/core";

export async function writeGlb(doc: Document, path: string): Promise<void> {
  const io = new NodeIO();
  await io.write(path, doc);
}
