import { zip } from "fflate";
import type { ZipOps } from "../ports.js";

export const webZipOps: ZipOps = {
  pack(files) {
    const entries: Record<string, Uint8Array> = {};
    for (const f of files) {
      entries[f.name] = f.bytes;
    }
    return new Promise<Uint8Array>((resolve, reject) => {
      zip(entries, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  },
};
