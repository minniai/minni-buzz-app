# minni Icelandic localization

This fork shows the Buzz UI in Icelandic without editing upstream's components.
A build-time transform rewrites visible English text into catalog lookups, so
upstream source stays byte-identical and upstream merges cannot conflict with
translations. A string the catalog does not know shows in English.

The approach follows the same rule as the [brand overlay](minni-brand.md):
additive where upstream owns the file, fork-owned files for everything else.

## What the fork owns

| File | Job |
| --- | --- |
| `scripts/minni-i18n/transform.mjs` | Decides what is visible text and rewrites it. |
| `scripts/minni-i18n/vite-plugin.mjs` | Applies the transform and serves the catalog. |
| `scripts/minni-i18n/extract.mjs` | Syncs the catalog with the source. |
| `scripts/minni-i18n/po.mjs` | Reads and writes the gettext catalog. |
| `scripts/minni-i18n/vitest.transform.config.ts` | Runs upstream's tests with the transform on. |
| `src/minni-i18n/is.po` | The translations, keyed by the English source text. |
| `src/minni-i18n/runtime.ts`, `translate.ts` | Picks the locale and looks strings up. |

Upstream-owned files carry two small edits: the plugin registration in
`vite.config.ts` (marked `minni fork`) and the `i18n:extract` script in
`package.json`.

## Choosing the language

The app uses the first supported language from the system list, and a stored
choice overrides it. There is no Settings entry yet. To switch, run this in the
developer console and reload:

```js
localStorage.setItem("minni.locale", "is"); // or "en"; removeItem for system
```

The locale resolves once at startup because many labels are built when their
module loads. Dates, lists and numbers follow the system language through `Intl`,
not this choice.

## What gets translated

- JSX text. Adjacent text and expressions become one message such as
  `Delete {name} forever?`, so a translation can reorder them. Child elements
  split a sentence into separate fragments.
- Attributes and object fields whose name ends in `label`, `title`, `description`,
  `placeholder`, `heading`, `message`, `hint`, `tooltip`, `caption`, `summary`,
  `error` or `notice`, plus `alt`, `action`, `empty`, `detail` and `reason`.
- Values assigned to variables or returned from functions with those names, and
  arguments to `notify`, `toast` and setters such as `setError`.
- Outside JSX, only strings starting with a capital letter.

These stay English on purpose:

- `new Error(...)` text. It mixes log text with user-visible text, and some code
  matches on it. Failures shown from a thrown error therefore read in English.
- Agent-facing text: `src/buzz-mcp`, tool and prompt files, JSON schema fields and
  wire errors with a `code`. Agents must keep receiving the prompts they expect.
- Code samples in `code`, `pre`, `kbd` and `samp`.
- Text the rules do not reach, such as array entries and object fields with other
  names. Native menus in Rust are also not covered.

## Labels that are also identities

Upstream sometimes compares a label or uses it as a key. The transform handles
this in two ways:

- A literal compared with a value named like a label is translated too, so
  `group.label === "Agents"` still holds in Icelandic.
- Strings in `IDENTITY_LABELS` in `transform.mjs` are never translated, because the
  value does not pass through the catalog on both sides. The visible cost is
  reminder group headings, the composer's formatting tool names and the "Removed"
  group in plugin access review.

## After every upstream merge

```sh
bin/pnpm i18n:extract
bin/pnpm exec vitest run scripts/minni-i18n src/minni-i18n
bin/pnpm exec vitest run --config scripts/minni-i18n/vitest.transform.config.ts
```

1. `i18n:extract` adds new strings with an empty translation and drops stale ones.
   Translate the empty entries in `is.po`. Until then they show in English.
2. The last command runs upstream's whole suite with the transform on. It must pass
   exactly as without the transform. A failure means the transform changed
   behaviour, usually a label that became an identity. Add it to `IDENTITY_LABELS`.
3. Search the merge for new comparisons on labels, since an English-locale test
   run cannot see them:

   ```sh
   git diff ORIG_HEAD..HEAD -- src | grep -E '^\+.*(label|title|Status)\)? *[!=]== *"[A-Z]'
   ```

## Editing translations

`is.po` is standard gettext, so Poedit, Weblate and Lingui can read it. Keep every
`{placeholder}` and any leading or trailing space; a test enforces both. Upstream's
open Lingui proposal uses the same format and also keys on English text, so these
translations can move to it if it lands.

## Known limits

- The catalog is a preliminary machine-assisted translation and needs a native
  speaker's review.
- Choosing Icelandic with the stored override leaves dates and times in the system
  language. They turn Icelandic only when the system language is Icelandic.
- Plurals follow upstream's `count === 1` checks. Icelandic treats 21, 31 and so
  on as singular, so those read wrong.
- Names inside placeholders are not inflected.
- The Icelandic document language applies to the whole page, including any
  English that remains.
