import { deflateSync } from "fflate";

export interface AsepriteLayer {
  readonly name: string;
  /** RGBA, top-down, length = width * height * 4. */
  readonly pixels: Uint8Array;
}

const MAGIC_HEADER = 0xa5e0;
const MAGIC_FRAME = 0xf1fa;
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const CEL_TYPE_COMPRESSED = 2;
const ZLIB_CMF = 0x78;
const ZLIB_FLG = 0x9c;

/**
 * Build a minimal .aseprite byte stream.
 * - Color mode: RGBA 32-bit
 * - One frame (duration 100ms)
 * - One cel per layer (compressed, zlib stream)
 *
 * Throws RangeError if width/height are not integers in [1, 65535],
 * or if any layer.pixels.length !== width * height * 4.
 */
export function writeAseprite(
  width: number,
  height: number,
  layers: ReadonlyArray<AsepriteLayer>,
): Uint8Array {
  if (!Number.isInteger(width) || width <= 0 || width > 65535) {
    throw new RangeError(`writeAseprite: width must be an integer in [1, 65535], got ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0 || height > 65535) {
    throw new RangeError(`writeAseprite: height must be an integer in [1, 65535], got ${height}`);
  }
  const expected = width * height * 4;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].pixels.length !== expected) {
      throw new RangeError(
        `writeAseprite: layers[${i}].pixels.length=${layers[i].pixels.length}, expected ${expected}`,
      );
    }
  }

  const w = new BinaryWriter();
  const fileSizePos = w.position;
  writeHeader(w, width, height);

  const frameStartPos = w.position;
  const chunkCount = layers.length * 2;
  writeFrameHeader(w, chunkCount);

  for (let i = 0; i < layers.length; i++) {
    writeLayerChunk(w, layers[i].name);
  }
  for (let i = 0; i < layers.length; i++) {
    writeCelChunk(w, i, width, height, layers[i].pixels);
  }

  const fileEnd = w.position;
  w.position = frameStartPos;
  w.u32(fileEnd - frameStartPos);
  w.position = fileSizePos;
  w.u32(fileEnd);

  return w.toBytes(fileEnd);
}

class BinaryWriter {
  private buf: Uint8Array;
  private view: DataView;
  public position = 0;
  private length = 0;

  constructor(initial = 1024) {
    this.buf = new Uint8Array(initial);
    this.view = new DataView(this.buf.buffer);
  }

  private grow(need: number): void {
    const required = this.position + need;
    if (required <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < required) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }
  private bump(n: number): void {
    this.position += n;
    if (this.position > this.length) this.length = this.position;
  }
  u8(v: number): void { this.grow(1); this.buf[this.position] = v & 0xff; this.bump(1); }
  u16(v: number): void { this.grow(2); this.view.setUint16(this.position, v, true); this.bump(2); }
  i16(v: number): void { this.grow(2); this.view.setInt16(this.position, v, true); this.bump(2); }
  u32(v: number): void { this.grow(4); this.view.setUint32(this.position, v >>> 0, true); this.bump(4); }
  bytes(b: Uint8Array): void { this.grow(b.length); this.buf.set(b, this.position); this.bump(b.length); }
  zeros(n: number): void { this.grow(n); this.bump(n); }
  toBytes(end?: number): Uint8Array {
    const finalLen = end ?? this.length;
    return this.buf.slice(0, finalLen);
  }
}

function writeHeader(w: BinaryWriter, width: number, height: number): void {
  w.u32(0);             // file size (backfilled)
  w.u16(MAGIC_HEADER);  // 0xA5E0
  w.u16(1);             // frames
  w.u16(width);
  w.u16(height);
  w.u16(32);            // color depth (RGBA)
  w.u32(1);             // flags (1 = layer opacity has valid value)
  w.u16(100);           // speed (deprecated)
  w.u32(0);             // reserved
  w.u32(0);             // reserved
  w.u8(0);              // transparent index
  w.zeros(3);           // reserved
  w.u16(0);             // num colors
  w.u8(1);              // pixel width
  w.u8(1);              // pixel height
  w.zeros(92);          // reserved
}

function writeFrameHeader(w: BinaryWriter, chunkCount: number): void {
  w.u32(0);                                              // frame size (backfilled)
  w.u16(MAGIC_FRAME);                                    // 0xF1FA
  w.u16(chunkCount > 0xffff ? 0xffff : chunkCount);      // old chunk count (u16)
  w.u16(100);                                            // duration ms
  w.zeros(2);                                            // reserved
  w.u32(chunkCount);                                     // new chunk count (u32)
}

function writeLayerChunk(w: BinaryWriter, name: string): void {
  const nameBytes = new TextEncoder().encode(name);
  const chunkSize = 6 + 18 + nameBytes.length;
  w.u32(chunkSize);
  w.u16(CHUNK_LAYER);
  // Body
  w.u16(0b11);   // flags: visible (1) | editable (2)
  w.u16(0);      // layer type (0 = image)
  w.u16(0);      // child level
  w.u16(0);      // default width (ignored)
  w.u16(0);      // default height (ignored)
  w.u16(0);      // blend mode (normal)
  w.u8(255);     // opacity
  w.zeros(3);    // reserved
  w.u16(nameBytes.length);
  w.bytes(nameBytes);
}

function writeCelChunk(
  w: BinaryWriter,
  layerIndex: number,
  width: number,
  height: number,
  pixels: Uint8Array,
): void {
  const deflated = deflateSync(pixels);
  const adler = adler32(pixels);
  const chunkSize = 32 + deflated.length;
  w.u32(chunkSize);
  w.u16(CHUNK_CEL);

  w.u16(layerIndex);
  w.i16(0);                       // x
  w.i16(0);                       // y
  w.u8(255);                      // opacity
  w.u16(CEL_TYPE_COMPRESSED);     // cel type 2
  w.zeros(7);                     // reserved

  w.u16(width);
  w.u16(height);
  w.u8(ZLIB_CMF);
  w.u8(ZLIB_FLG);
  w.bytes(deflated);
  // Adler32 big-endian
  w.u8((adler >>> 24) & 0xff);
  w.u8((adler >>> 16) & 0xff);
  w.u8((adler >>> 8) & 0xff);
  w.u8(adler & 0xff);
}

function adler32(data: Uint8Array): number {
  const MOD = 65521;
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b * 0x10000 + a) >>> 0);
}
