// minni fork: pure lookup and formatting behind the runtime the transform calls.
import { createElement, Fragment, type ReactNode } from "react";

export type Catalog = Readonly<Record<string, string>>;
export type Locale = "is" | "en";

const PLACEHOLDER = /\{(\w+)\}/g;

/** A stored choice wins; otherwise the first system language this app supports. */
export function resolveLocale(
  stored: string | null,
  languages: readonly string[],
): Locale {
  if (stored === "is" || stored === "en") return stored;
  for (const language of languages) {
    const primary = language.toLowerCase().split(/[-_]/)[0];
    if (primary === "is" || primary === "en") return primary;
  }
  return "en";
}

function lookup(catalog: Catalog | null, source: string) {
  return (
    (catalog && Object.hasOwn(catalog, source) && catalog[source]) || source
  );
}

/** Text for a string context; values coerce as they would in a template literal. */
export function translateText(
  catalog: Catalog | null,
  source: string,
  values?: Record<string, unknown>,
): string {
  const message = lookup(catalog, source);
  if (!values) return message;
  return message.replace(PLACEHOLDER, (whole, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole,
  );
}

function renderable(value: unknown) {
  return value === null || value === undefined || typeof value === "boolean"
    ? ""
    : value;
}

/** Text for a JSX child; values may be elements and follow React's empty rules. */
export function translateNode(
  catalog: Catalog | null,
  source: string,
  values: Record<string, ReactNode>,
): ReactNode {
  const parts = lookup(catalog, source).split(PLACEHOLDER);
  const nodes = parts.map((part, index) =>
    index % 2 === 1 && Object.hasOwn(values, part)
      ? renderable(values[part])
      : index % 2 === 1
        ? `{${part}}`
        : part,
  );
  if (nodes.every((n) => typeof n === "string" || typeof n === "number"))
    return nodes.join("");
  return createElement(Fragment, null, ...(nodes as ReactNode[]));
}
