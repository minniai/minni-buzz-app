#!/usr/bin/env node
// minni fork: syncs src/minni-i18n/is.po with the strings the transform finds.
//   node scripts/minni-i18n/extract.mjs          add new strings, drop stale ones
//   node scripts/minni-i18n/extract.mjs --check  report only; exit 1 if out of sync
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatPo, parsePo } from "./po.mjs";
import { isTranslatableFile, transformSource } from "./transform.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const catalogPath = `${root}src/minni-i18n/is.po`;

function extract() {
  const files = execFileSync("git", ["ls-files", "src"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(isTranslatableFile);
  const seen = new Map();
  for (const file of files) {
    const source = readFileSync(`${root}${file}`, "utf8");
    for (const { text, offset } of transformSource(file, source).messages) {
      if (seen.has(text)) continue;
      const line = source.slice(0, offset).split("\n").length;
      seen.set(text, `${file}:${line}`);
    }
  }
  return seen;
}

let existing = [];
try {
  existing = parsePo(readFileSync(catalogPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const translations = new Map(existing.map((e) => [e.msgid, e.msgstr]));
const found = extract();
const entries = [...found]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([msgid, ref]) => ({
    msgid,
    msgstr: translations.get(msgid) ?? "",
    refs: [ref],
  }));

const added = entries.filter((e) => !translations.has(e.msgid));
const stale = existing.filter((e) => !found.has(e.msgid));
const translated = entries.filter((e) => e.msgstr).length;
const percent = entries.length
  ? ((100 * translated) / entries.length).toFixed(1)
  : "0.0";
console.log(
  `${entries.length} strings, ${translated} translated (${percent}%)`,
);
console.log(`${added.length} new, ${stale.length} stale`);

if (process.argv.includes("--check")) {
  for (const e of added.slice(0, 50)) console.log(`  new: ${e.msgid}`);
  for (const e of stale.slice(0, 50)) console.log(`  stale: ${e.msgid}`);
  process.exit(added.length || stale.length ? 1 : 0);
}
writeFileSync(catalogPath, formatPo(entries));
