#!/usr/bin/env node

/**
 * Build script for the CLI using esbuild
 *
 * Features:
 * - Bundles TypeScript source to CommonJS
 * - Automatically adds shebang (#!/usr/bin/env node) to output
 * - Makes output file executable
 * - Supports watch mode for development
 * - Outputs to dist/cli.cjs for compatibility with ES modules project
 *
 * Usage:
 * - npm run build (single build)
 * - npm run build:watch (watch mode)
 */

import { build } from "esbuild";
import { rmSync, existsSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function buildCLI() {
  const isWatch = process.argv.includes("--watch");

  try {
    // Clean up old build files (only on initial build, not in watch mode)
    if (!isWatch) {
      const distDir = join(__dirname, "dist");
      if (existsSync(distDir)) {
        rmSync(distDir, { recursive: true, force: true });
      }
    }

    const buildOptions = {
      entryPoints: [join(__dirname, "bin/cli.ts")],
      bundle: true,
      platform: "node",
      target: "node18",
      outfile: join(__dirname, "dist/cli.cjs"),
      format: "cjs",
      external: [
        "commander",
        "fs-extra",
        "handlebars",
        "nanospinner",
        "js-yaml",
      ],
      minify: false,
      sourcemap: false,
      banner: {
        js: "#!/usr/bin/env node",
      },
      logLevel: "info",
    };

    if (isWatch) {
      // Watch mode
      const ctx = await build({
        ...buildOptions,
        plugins: [
          {
            name: "make-executable",
            setup(build) {
              build.onEnd(() => {
                const outputFile = join(__dirname, "dist/cli.cjs");
                chmodSync(outputFile, 0o755);
                console.log("✅ CLI rebuilt successfully with shebang");
              });
            },
          },
        ],
      });

      await ctx.watch();
      console.log("👀 Watching for changes...");
    } else {
      // Single build
      await build(buildOptions);

      // Make the CLI executable
      const outputFile = join(__dirname, "dist/cli.cjs");
      chmodSync(outputFile, 0o755);

      console.log("✅ CLI built successfully with shebang");
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

buildCLI();
