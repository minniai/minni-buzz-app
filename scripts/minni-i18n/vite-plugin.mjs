// minni fork: registered once in vite.config.ts. Test and fixture builds use their
// own Vite configs without it, so they keep seeing upstream's English source.
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { catalogFromPo } from "./po.mjs";
import { isTranslatableFile, transformSource } from "./transform.mjs";

export function minniI18n() {
  let root = process.cwd();
  return {
    name: "minni-i18n",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    load(id) {
      const file = id.split("?")[0];
      if (!file.endsWith("/src/minni-i18n/is.po")) return undefined;
      return `export default ${JSON.stringify(catalogFromPo(readFileSync(file, "utf8")))};`;
    },
    transform(code, id) {
      const path = relative(root, id.split("?")[0]);
      if (!isTranslatableFile(path)) return undefined;
      const result = transformSource(path, code);
      return result.code === code
        ? undefined
        : { code: result.code, map: null };
    },
  };
}
