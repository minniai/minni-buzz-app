import { expect, it } from "vitest";
import { catalogFromPo, formatPo, parsePo } from "./po.mjs";

it("round-trips quotes, backslashes and newlines", () => {
  const entries = [
    {
      msgid: 'Say "hi" \\ there\nnow',
      msgstr: 'Segðu "hæ"',
      refs: ["src/a.ts:1"],
    },
    { msgid: "Empty", msgstr: "", refs: [] },
  ];
  expect(parsePo(formatPo(entries))).toEqual(entries);
});

it("leaves untranslated entries out of the runtime catalog", () => {
  const text = formatPo([
    { msgid: "Save", msgstr: "Vista" },
    { msgid: "Cancel", msgstr: "" },
  ]);
  expect(catalogFromPo(text)).toEqual({ Save: "Vista" });
});

it("reads continuation lines from other PO tools", () => {
  const text = 'msgid ""\nmsgstr ""\n\nmsgid "A"\nmsgstr ""\n"Be"\n"ta"\n';
  expect(catalogFromPo(text)).toEqual({ A: "Beta" });
});
