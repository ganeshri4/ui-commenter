/**
 * Production Build Script for Comments (Chrome Extension MV3)
 * Bundles ES modules and third-party dependencies using esbuild.
 */

import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";

const isWatch = process.argv.includes("--watch");

async function build() {
  console.log("⚡ [Comments] Starting extension build...");

  // Ensure output directories exist
  fs.mkdirSync("dist/sidepanel", { recursive: true });

  // 1. Content Script Bundle (IIFE format for seamless content script execution)
  const contentConfig = {
    entryPoints: ["src/content/content.js"],
    bundle: true,
    outfile: "dist/content.bundle.js",
    format: "iife",
    platform: "browser",
    target: ["chrome110"],
    sourcemap: !isWatch ? false : "inline",
    minify: !isWatch,
    define: {
      "process.env.NODE_ENV": isWatch ? '"development"' : '"production"'
    }
  };

  // 2. Background Service Worker Bundle (ESM format for MV3 module service worker)
  const backgroundConfig = {
    entryPoints: ["src/background/background.js"],
    bundle: true,
    outfile: "dist/background.bundle.js",
    format: "esm",
    platform: "browser",
    target: ["chrome110"],
    sourcemap: !isWatch ? false : "inline",
    minify: !isWatch,
    define: {
      "process.env.NODE_ENV": isWatch ? '"development"' : '"production"'
    }
  };

  // 3. Side Panel Script Bundle (ESM format)
  const sidepanelConfig = {
    entryPoints: ["src/sidepanel/sidepanel.js"],
    bundle: true,
    outfile: "dist/sidepanel/sidepanel.bundle.js",
    format: "esm",
    platform: "browser",
    target: ["chrome110"],
    sourcemap: !isWatch ? false : "inline",
    minify: !isWatch,
    define: {
      "process.env.NODE_ENV": isWatch ? '"development"' : '"production"'
    }
  };

  // Copy HTML and CSS static assets for sidepanel
  fs.copyFileSync("src/sidepanel/index.html", "dist/sidepanel/index.html");
  fs.copyFileSync("src/sidepanel/sidepanel.css", "dist/sidepanel/sidepanel.css");

  if (isWatch) {
    const ctxContent = await esbuild.context(contentConfig);
    const ctxBg = await esbuild.context(backgroundConfig);
    const ctxPanel = await esbuild.context(sidepanelConfig);

    await ctxContent.watch();
    await ctxBg.watch();
    await ctxPanel.watch();
    console.log("👀 Watching for file changes...");
  } else {
    await Promise.all([
      esbuild.build(contentConfig),
      esbuild.build(backgroundConfig),
      esbuild.build(sidepanelConfig)
    ]);
    console.log("✅ [Comments] Build completed successfully into dist/");
  }
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
