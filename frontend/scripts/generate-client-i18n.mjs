// Writes lib/i18n-server-only-keys.json: UI strings whose every literal use is a
// server t()/uiText() call, so the layout can leave them out of the browser catalog.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(FRONTEND, "lib", "i18n-server-only-keys.json");
const TABLE = /^(ui-translations|i18n-x\w+)\.ts$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const TABLE_KEY =
  /^ {2}(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([A-Za-z_$][\w$]*)): \{$/gm;

function catalogKeys() {
  const keys = new Set();
  const lib = join(FRONTEND, "lib");
  for (const name of readdirSync(lib).filter((n) => TABLE.test(n))) {
    const src = readFileSync(join(lib, name), "utf8");
    for (const m of src.matchAll(TABLE_KEY)) {
      keys.add(m[3] ?? unescape(m[1] ?? m[2]));
    }
  }
  return keys;
}

function unescape(text) {
  return text.replace(/\\(.)/g, "$1");
}

function quotedForms(key) {
  const escaped = key.replace(/\\/g, "\\\\");
  return [
    `"${escaped.replace(/"/g, '\\"')}"`,
    `'${escaped.replace(/'/g, "\\'")}'`,
    `\`${escaped.replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``,
  ];
}

function scanSource(path, keys, server, other) {
  const src = readFileSync(path, "utf8");
  const isClient = /^\s*["']use client["']/m.test(src);
  const serverT = !isClient && /await getT\(/.test(src) && !/useT\(/.test(src);
  for (const key of keys) {
    if (!src.includes(key.slice(0, 40).split(/["'`\\]/)[0])) continue;
    for (const form of quotedForms(key)) {
      for (let i = src.indexOf(form); i >= 0; i = src.indexOf(form, i + 1)) {
        const before = src.slice(Math.max(0, i - 80), i);
        const isServerCall =
          (serverT && /\bt\(\s*$/.test(before)) ||
          (!isClient && /\buiText\(\s*[\w.]+,\s*$/.test(before));
        (isServerCall ? server : other).add(key);
      }
    }
  }
}

function scanJson(path, keys, other) {
  const visit = (node) => {
    if (typeof node === "string") {
      if (keys.has(node)) other.add(node);
    } else if (node && typeof node === "object") {
      for (const value of Object.values(node)) visit(value);
    }
  };
  try {
    visit(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return;
  }
}

export async function serverOnlyKeys() {
  const keys = catalogKeys();
  const server = new Set();
  const other = new Set();
  for (const root of ["app", "lib", "i18n"]) {
    for (const path of walk(join(FRONTEND, root))) {
      const rel = relative(FRONTEND, path);
      if (/\.test\.tsx?$/.test(rel) || rel === relative(FRONTEND, OUT))
        continue;
      if (TABLE.test(path.split(/[\\/]/).pop())) continue;
      if (/\.(ts|tsx|mjs|js)$/.test(rel)) scanSource(path, keys, server, other);
      else if (rel.endsWith(".json")) scanJson(path, keys, other);
    }
  }
  return [...server].filter((key) => !other.has(key)).sort();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const keys = await serverOnlyKeys();
  writeFileSync(OUT, JSON.stringify(keys, null, 2) + "\n");
  console.log(`i18n: ${keys.length} server-only UI strings`);
}
