import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parsePo } from "./po.mjs";

const entries = parsePo(
  readFileSync(new URL("../../src/minni-i18n/is.po", import.meta.url), "utf8"),
);
// `{plural}` is an English ending that a translation normally leaves out.
const placeholders = (text) =>
  (text.match(/\{\w+\}/g) ?? []).filter((p) => !p.startsWith("{plural")).sort();

it("keeps every placeholder in every translation", () => {
  const broken = entries.filter(
    (e) =>
      e.msgstr &&
      JSON.stringify(placeholders(e.msgid)) !==
        JSON.stringify(placeholders(e.msgstr)),
  );
  expect(broken.map((e) => e.msgid)).toEqual([]);
});

it("keeps leading and trailing spaces, which join text around placeholders", () => {
  const edge = (text) => [text.startsWith(" "), text.endsWith(" ")];
  const broken = entries.filter(
    (e) => e.msgstr && String(edge(e.msgid)) !== String(edge(e.msgstr)),
  );
  expect(broken.map((e) => e.msgid)).toEqual([]);
});
