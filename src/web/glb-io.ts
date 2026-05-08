import { NodeIO } from "@gltf-transform/core";
import type { Document } from "@gltf-transform/core";

// NodeIO works fine in browsers when used in pure-bytes mode (readBinary/writeBinary).
// It does not touch the filesystem in this code path.
const io = new NodeIO();

export async function readGlbFromBytes(bytes: Uint8Array): Promise<Document> {
  return io.readBinary(bytes);
}

export async function writeGlbToBytes(doc: Document): Promise<Uint8Array> {
  return io.writeBinary(doc);
}
