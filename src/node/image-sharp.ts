import sharp from "sharp";
import type { ImageOps } from "../ports.js";

export const nodeImageOps: ImageOps = {
  async probe(buf) {
    const meta = await sharp(Buffer.from(buf)).metadata();
    if (!meta.width || !meta.height) {
      throw new Error("nodeImageOps.probe: unreadable image dimensions");
    }
    return { width: meta.width, height: meta.height };
  },

  async cropToPng(buf, rect) {
    const cropped = await sharp(Buffer.from(buf))
      .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
      .png()
      .toBuffer();
    return new Uint8Array(cropped);
  },

  async decodeRgba(buf) {
    const { data, info } = await sharp(Buffer.from(buf))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      width: info.width,
      height: info.height,
      pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    };
  },
};
