import { writeFile } from "node:fs/promises";

export async function writePng(buf: Uint8Array, path: string): Promise<void> {
  await writeFile(path, buf);
}
