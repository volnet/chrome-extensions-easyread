import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build, transform } from "esbuild";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "src");
const distRoot = join(repositoryRoot, "dist");
const jsZipSource = join(repositoryRoot, "node_modules", "jszip", "dist", "jszip.min.js");
const muxMp4Source = join(repositoryRoot, "node_modules", "mux.js", "dist", "mux-mp4.min.js");
const hlsSource = join(repositoryRoot, "node_modules", "hls.js", "dist", "hls.light.min.js");

function normalizedRelativePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function copySource(destination, mode) {
  cpSync(sourceRoot, destination, {
    recursive: true,
    filter(source) {
      const path = normalizedRelativePath(sourceRoot, source);
      if (mode === "production") return !path.startsWith("assets/logo-dev");
      return !path.startsWith("assets/logo-dev") && !path.startsWith("assets/logo/");
    }
  });

  if (mode === "development") {
    cpSync(join(sourceRoot, "assets", "logo-dev"), join(destination, "assets", "logo"), { recursive: true });
  }

  const jsZipDestination = join(destination, "scripts", "jszip.min.js");
  mkdirSync(dirname(jsZipDestination), { recursive: true });
  cpSync(jsZipSource, jsZipDestination);
  cpSync(muxMp4Source, join(destination, "scripts", "mux-mp4.min.js"));
  cpSync(hlsSource, join(destination, "scripts", "hls.min.js"));
  const diagnosticsPath = join(destination, "scripts", "diagnostics.js");
  writeFileSync(diagnosticsPath, mode === "development"
    ? readFileSync(diagnosticsPath, "utf8").replace("const DEVELOPMENT_DIAGNOSTICS = false;", "const DEVELOPMENT_DIAGNOSTICS = true;")
    : "/* Development diagnostics are excluded from release builds. */\n");
}

function listJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(path);
    return [".js", ".mjs"].includes(extname(entry.name)) ? [path] : [];
  });
}

async function minifyProduction(destination) {
  const files = listJavaScriptFiles(destination)
    .filter((path) => !["scripts/jszip.min.js", "scripts/mux-mp4.min.js", "scripts/hls.min.js"].includes(normalizedRelativePath(destination, path)));

  await Promise.all(files.map(async (path) => {
    const result = await transform(readFileSync(path, "utf8"), {
      loader: "js",
      minify: true,
      target: ["chrome91", "edge91"],
      legalComments: "inline"
    });
    writeFileSync(path, result.code, "utf8");
  }));
}

rmSync(distRoot, { recursive: true, force: true });

const developmentRoot = join(distRoot, "development");
const productionRoot = join(distRoot, "production");
copySource(developmentRoot, "development");
copySource(productionRoot, "production");
for (const destination of [developmentRoot, productionRoot]) {
  await build({ entryPoints: [join(sourceRoot, "scripts", "mediaEngine.mjs")], outfile: join(destination, "scripts", "mediaEngine.js"), bundle: true, platform: "browser", format: "iife", target: "chrome91", minify: destination === productionRoot, legalComments: "inline" });
  cpSync(join(repositoryRoot, "node_modules", "mp4box", "LICENSE"), join(destination, "scripts", "MP4BOX-LICENSE.txt"));
}
await minifyProduction(productionRoot);

console.log("Built dist/development and dist/production.");
