import { createWriteStream } from "node:fs";
import { basename } from "node:path";
import archiver from "archiver";

export async function packZip(filePaths: string[], zipPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    out.on("close", () => resolve());
    out.on("error", reject);
    archive.on("error", reject);
    archive.pipe(out);
    for (const p of filePaths) archive.file(p, { name: basename(p) });
    archive.finalize();
  });
}
