import { NodeIO } from "@gltf-transform/core";
import type { Document } from "@gltf-transform/core";

export async function load(path: string): Promise<Document> {
  const io = new NodeIO();
  return io.read(path);
}
