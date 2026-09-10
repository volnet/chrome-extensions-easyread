import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "src");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`${relative(repositoryRoot, path)} is not valid JSON: ${error.message}`);
    return null;
  }
}

const packageJson = readJson(join(repositoryRoot, "package.json"));
const manifest = readJson(join(sourceRoot, "manifest.json"));
const englishMessages = readJson(join(sourceRoot, "_locales", "en", "messages.json"));
const chineseMessages = readJson(join(sourceRoot, "_locales", "zh_CN", "messages.json"));

if (packageJson && manifest) {
  check(packageJson.version === manifest.version, "package.json and manifest.json versions differ");
  check(manifest.manifest_version === 3, "manifest.json must remain Manifest V3");
  check(manifest.background?.type === "module", "background service worker must remain an ES module");
  check(Array.isArray(manifest.permissions), "manifest permissions must be an array");
  check(!manifest.host_permissions, "unexpected host_permissions were added");

  const referencedFiles = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    ...(manifest.content_scripts ?? []).flatMap((item) => item.js ?? []),
    ...(manifest.content_scripts ?? []).flatMap((item) => item.css ?? []),
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {})
  ].filter(Boolean);

  for (const referencedFile of referencedFiles) {
    check(existsSync(join(sourceRoot, referencedFile)), `manifest references missing file: ${referencedFile}`);
  }
}

if (englishMessages && chineseMessages) {
  const englishKeys = Object.keys(englishMessages).sort();
  const chineseKeys = Object.keys(chineseMessages).sort();
  check(
    JSON.stringify(englishKeys) === JSON.stringify(chineseKeys),
    "English and Simplified Chinese locale keys differ"
  );
}

try {
  const sourceFiles = execFileSync("rg", ["--files", "src", "-g", "*.js", "-g", "*.mjs", "-g", "!src/scripts/jszip.min.js"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim().split(/\r?\n/).filter(Boolean);

  for (const sourceFile of sourceFiles) {
    execFileSync(process.execPath, ["--check", sourceFile], { cwd: repositoryRoot, stdio: "pipe" });
  }
} catch (error) {
  failures.push(`JavaScript syntax check failed: ${error.stderr?.toString().trim() || error.message}`);
}

try {
  const trackedPrivateKeys = execFileSync("git", ["ls-files", "*.pem", "*.key", "*.p12", "*.pfx"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
  check(!trackedPrivateKeys, `private key material is tracked: ${trackedPrivateKeys}`);
} catch (error) {
  failures.push(`could not inspect tracked private keys: ${error.message}`);
}

if (failures.length > 0) {
  console.error("EasyRead baseline verification failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("EasyRead baseline verification passed.");
