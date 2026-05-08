import { writeFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { runCore } from "../core/pipeline-core.js";
import type { UvBbox } from "../core/uv-bbox.js";
import { nodeImageOps } from "./image-sharp.js";
import { nodeZipOps } from "./zip-archiver.js";
import { readGlbFromPath, writeGlbToBytes } from "./glb-io.js";

export interface PipelineOptions {
  inputPath: string;
  outputDir: string;
  zip: boolean;
}

export interface PipelineResult {
  bbox: UvBbox;
  baseColorSize: { width: number; height: number };
  outputs: { glb: string; png: string; zip: string | null };
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const stem = basename(opts.inputPath, extname(opts.inputPath));
  const outGlbPath = join(opts.outputDir, `${stem}.glb`);
  const outPngPath = join(opts.outputDir, `${stem}.png`);
  const outZipPath = join(opts.outputDir, `${stem}.zip`);

  const doc = await readGlbFromPath(opts.inputPath);
  const result = await runCore({ doc, image: nodeImageOps });
  const outGlbBytes = await writeGlbToBytes(doc);

  await writeFile(outGlbPath, outGlbBytes);
  await writeFile(outPngPath, result.baseColorPng);

  let zipPath: string | null = null;
  if (opts.zip) {
    const zipBytes = await nodeZipOps.pack([
      { name: `${stem}.glb`, bytes: outGlbBytes },
      { name: `${stem}.png`, bytes: result.baseColorPng },
    ]);
    await writeFile(outZipPath, zipBytes);
    zipPath = outZipPath;
  }

  return {
    bbox: result.bbox,
    baseColorSize: result.baseColorSize,
    outputs: { glb: outGlbPath, png: outPngPath, zip: zipPath },
  };
}
