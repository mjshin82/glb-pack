import { Writable } from "node:stream";
import archiver from "archiver";
import type { ZipOps } from "../ports.js";

export const nodeZipOps: ZipOps = {
  async pack(files) {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    });

    await new Promise<void>((resolve, reject) => {
      const archive = archiver("zip", { zlib: { level: 9 } });
      sink.on("finish", () => resolve());
      sink.on("error", reject);
      archive.on("error", reject);
      archive.pipe(sink);
      for (const f of files) {
        archive.append(Buffer.from(f.bytes), { name: f.name });
      }
      archive.finalize();
    });

    return new Uint8Array(Buffer.concat(chunks));
  },
};
