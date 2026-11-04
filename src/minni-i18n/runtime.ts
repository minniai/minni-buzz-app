// minni fork: the module transformed source imports. It resolves the locale once
// at load, before any module-level label is built; switching takes a reload.
import type { ReactNode } from "react";
import isCatalog from "./is.po";
import {
  type Catalog,
  resolveLocale,
  translateNode,
  translateText,
} from "./translate";

export const LOCALE_STORAGE_KEY = "minni.locale";

function storedLocale() {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

const locale = resolveLocale(
  storedLocale(),
  typeof navigator === "undefined" ? [] : navigator.languages,
);
const catalog: Catalog | null = locale === "is" ? isCatalog : null;

if (locale === "is" && typeof document !== "undefined")
  document.documentElement.lang = "is";

export function __minniT(source: string, values?: Record<string, unknown>) {
  return translateText(catalog, source, values);
}

export function __minniTN(source: string, values: Record<string, ReactNode>) {
  return translateNode(catalog, source, values);
}
