// minni fork: the small part of gettext PO this catalog uses, so it stays readable
// by Weblate, Poedit and Lingui. One msgid per English source string.
const unquote = (s) =>
  s.replace(/\\(["\\nt])/g, (_, c) => ({ n: "\n", t: "\t" })[c] ?? c);
const quote = (s) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");

export function parsePo(text) {
  const entries = [];
  let entry = null;
  let field = null;
  let refs = [];
  const flush = () => {
    if (entry && entry.msgid !== "") entries.push(entry);
    entry = null;
    field = null;
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#:")) {
      if (entry?.msgstr !== undefined) flush();
      refs.push(line.slice(2).trim());
    } else if (line.startsWith("msgid ")) {
      flush();
      entry = { msgid: unquote(line.slice(7, -1)), msgstr: undefined, refs };
      refs = [];
      field = "msgid";
    } else if (line.startsWith("msgstr ") && entry) {
      entry.msgstr = unquote(line.slice(8, -1));
      field = "msgstr";
    } else if (line.startsWith('"') && entry && field) {
      entry[field] += unquote(line.slice(1, -1));
    }
  }
  flush();
  return entries;
}

export function formatPo(entries) {
  const header =
    'msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n"Language: is\\n"\n"Plural-Forms: nplurals=2; plural=(n%10!=1 || n%100==11);\\n"\n';
  const body = entries.map(({ msgid, msgstr, refs = [] }) =>
    [
      ...refs.map((ref) => `#: ${ref}`),
      `msgid "${quote(msgid)}"`,
      `msgstr "${quote(msgstr ?? "")}"`,
      "",
    ].join("\n"),
  );
  return [header, ...body].join("\n");
}

export function catalogFromPo(text) {
  return Object.fromEntries(
    parsePo(text)
      .filter((e) => e.msgstr)
      .map((e) => [e.msgid, e.msgstr]),
  );
}
