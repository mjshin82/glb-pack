#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runPipeline } from "./pipeline.js";
import { ValidationError } from "./core/errors.js";

const USAGE = `glb-pack — crop unused texture space and remap UVs in a GLB.

Usage:
  glb-pack <name>             Read models/<name>.glb, write outputs/<name>.{glb,png,zip}
  glb-pack <path/to.glb>      Read the given file, write outputs/<stem>.{glb,png,zip}

Options:
  --no-zip                    Skip the .zip output
  --help, -h                  Show this help
  --version, -V               Show version
`;

function resolveInput(arg: string): string {
  if (arg.endsWith(".glb")) return resolve(arg);
  return resolve("models", `${arg}.glb`);
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args.includes("--version") || args.includes("-V")) {
    process.stdout.write("0.1.0\n");
    return 0;
  }

  const zip = !args.includes("--no-zip");
  const positional = args.filter((a) => !a.startsWith("--") && !a.startsWith("-"));
  if (positional.length !== 1) {
    process.stderr.write(USAGE);
    return 2;
  }

  const inputPath = resolveInput(positional[0]);
  if (!existsSync(inputPath)) {
    process.stderr.write(`Input not found: ${inputPath}\n`);
    return 2;
  }

  const outputDir = resolve("outputs");
  await mkdir(outputDir, { recursive: true });

  try {
    const result = await runPipeline({ inputPath, outputDir, zip });
    process.stdout.write(`✓ Loaded ${inputPath}\n`);
    process.stdout.write(
      `✓ UV bbox: [${result.bbox.uMin.toFixed(2)}, ${result.bbox.vMin.toFixed(2)}] ` +
        `– [${result.bbox.uMax.toFixed(2)}, ${result.bbox.vMax.toFixed(2)}]\n`,
    );
    process.stdout.write(
      `✓ baseColor cropped to ${result.baseColorSize.width}×${result.baseColorSize.height}\n`,
    );
    process.stdout.write(`✓ Wrote ${result.outputs.glb}\n`);
    process.stdout.write(`✓ Wrote ${result.outputs.png}\n`);
    if (result.outputs.zip) process.stdout.write(`✓ Wrote ${result.outputs.zip}\n`);
    return 0;
  } catch (err) {
    if (err instanceof ValidationError) {
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
    process.stderr.write(`${(err as Error).stack ?? String(err)}\n`);
    return 2;
  }
}

main(process.argv).then((code) => process.exit(code));
