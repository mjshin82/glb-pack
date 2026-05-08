import { NodeIO } from "@gltf-transform/core";
import type { Document } from "@gltf-transform/core";

const io = new NodeIO();

export async function readGlbFromPath(path: string): Promise<Document> {
  return io.read(path);
}

export async function writeGlbToBytes(doc: Document): Promise<Uint8Array> {
  return io.writeBinary(doc);
}
