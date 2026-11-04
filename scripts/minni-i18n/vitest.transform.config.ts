// minni fork: runs upstream's suite with the transform on, in the English locale.
// Any failure means the transform changed behaviour. See docs/minni-i18n.md.
import { mergeConfig } from "vitest/config";
import base from "../../vitest.config";
import { minniI18n } from "./vite-plugin.mjs";

export default mergeConfig(base, { plugins: [minniI18n()] });
