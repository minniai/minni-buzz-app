# minni brand overlay

This fork of [block/buzz-app](https://github.com/block/buzz-app) carries the
Minni ehf. brand as a thin overlay on Buzz's design system. The overlay changes
what the app looks like without changing how the design system works, so
upstream changes keep merging. This document describes what the overlay is, why
each piece lives where it does, and what to do when upstream moves.

Source of the visual decisions: the Minni Design System (jade palette, Barlow
and Barlow Condensed, square corners, no shadows, no textures).

## Principles

- **Additive where upstream owns the file.** Inside files upstream edits, the
  fork adds fenced blocks and one-line changes marked `minni fork`. It never
  rewrites upstream values in place. A rebase conflicts only if upstream edits
  the exact lines the fork touched.
- **Overrides where the fork owns the file.** Everything that *replaces* an
  upstream value lives in a fork-only file loaded last, so the cascade does the
  overriding and upstream's file stays byte-identical.
- **Upstream's guards validate the brand.** The accent family is a real
  Appearance accent, so `check-color`, `check-contrast`, `tokens.test.ts` and
  `service.test.ts` cover it the same way they cover Citrus.
- **Fork edits to tests are upstreamable.** Where tests hard-coded the default
  accent or the swatch count, the fork made them read `DEFAULT_ACCENT` and
  `ACCENTS.length`. Those edits pass with either default and could be sent
  upstream, which would remove them from the fork diff.

## What the overlay is

Find every fork edit with:

```sh
git grep -l "minni fork"
```

| File | Owner | Change |
| --- | --- | --- |
| `src/shared/design-system/styles/tokens.css` | upstream | Three fenced `>>> minni fork … <<< minni fork` blocks: the jade palette with literal owners and the light binding (after the orange ramp in Layer 0); the dark binding (after the dark orange ramp); the `[data-accent="minni"]` accent family (after the last upstream accent block in Layer 2). |
| `src/shared/design-system/styles/brand/minni.css` | fork | The overlay: self-hosted `@font-face` for Barlow and Barlow Condensed; `--font-sans` and a `--font-heading` role; every corner and radius role to `0`; `--shadow-xs`/`--shadow-sm` to `none`; `--shadow-panel` as a 1px `--border-standard` ring; the dot texture resolved to `--bg-app`. No colour literals. |
| `src/shared/styles/globals.css` | upstream | One `@import` of the overlay, last. This is the app's stylesheet entry. |
| `src/shared/design-system/styles/globals.css` | upstream | Same import, last. This is the design-system viewer's entry. |
| `src/app/startup.css` | upstream | Same import, last. See [Why three imports](#why-three-imports). |
| `src/shared/design-system/tokens/brand.ts` | upstream | `"minni"` added first in `ACCENTS`, so the swatch appears first in Appearance. |
| `src/shared/theme/accent.ts` | upstream | `DEFAULT_ACCENT = "minni"` (upstream: `"citrus"`). |
| `public/appearance-init.js` | upstream | Default `"minni"` and `accents.unshift("minni")`. This script runs before paint and must agree with `accent.ts`. |
| `public/fonts/minni/` | fork | Barlow 400/400i/500 and Barlow Condensed 400/500, Latin subset, woff2, with `OFL.txt`. |
| `src/shared/theme/service.test.ts`, `src/shared/theme/tokens.test.ts`, `src/app/AppearanceSettings.test.tsx` | upstream | Hard-coded `"citrus"` and `6` replaced by `DEFAULT_ACCENT` and `ACCENTS.length`. One Citrus-specific assertion now passes `"citrus"` explicitly. |

Upstream's six accents stay selectable. A user who picks Citrus gets upstream's
Citrus; only the default and the first swatch changed.

## How it works

### Colour

Buzz's colour system is four layers in `tokens.css`: palette literals, hue
families, semantic roles, and Tailwind registration. An accent is chosen by the
`data-accent` attribute on `<html>`, which rebinds the `--accent-*` family
roles; everything from the send button to the selected sidebar row then follows
through the role layer. The fork adds a seventh family and makes it the default.
No role was edited.

The jade ramp maps the Minni Design System onto Buzz's twelve steps:

| Step | Job | Light | Dark |
| --- | --- | --- | --- |
| 1–2 | app and subtle surfaces | near-paper jade tints | near-ink jade tints |
| 3–5 | tinted and selected surfaces | jade-100 `#e4efea` to jade-200 `#c9e0d6` | deep jade |
| 6–8 | borders, focus ring | jade-300 `#8fbcac` | mid jade |
| 9 | strong fill (send, own bubble on High contrast) | jade-600 `#457b6b` | jade-600 `#457b6b` |
| 10 | strong fill, hovered | jade-700 `#3e6f60` | jade-700 `#3e6f60` |
| 11 | text on a tint, links | jade-text `#376255` | jade-on-ink `#a9cfc2` |
| 12 | high-contrast text | jade-900 `#223c34` | jade-100 `#e4efea` |
| contrast, ink | text on the strong fill | white | white |
| pressed | pressed fill | jade-800 `#2f5449` | jade-800 `#2f5449` |

Steps 3, 5, 8, 11 and 12 are the design system's own values. The rest are
interpolated on the same hue.

**The strong fill is jade-600, not the brand's primary jade `#4e8a78`.** White
on `#4e8a78` is 4.01:1 and fails WCAG AA for text, which `check-contrast`
rejects. Jade-600 passes at 4.9:1. The brand jade still appears in the logo,
which is artwork, not a text surface. Do not "fix" the fill back to `#4e8a78`;
the guard will fail and the fix is correct.

Why the palette lives in the hottest upstream file rather than the overlay:
`check-color.mjs` accepts palette literals in `tokens.css` and nowhere else, and
`brand.test.ts` slices `tokens.css` by its section headers to verify that every
family step has light and dark owners. The three blocks are the smallest
addition that satisfies both.

### Geometry, elevation, texture

These are role overrides in `brand/minni.css`:

- Corners: `--corner-row`, `--corner-control`, `--corner-container`,
  `--corner-panel`, the `--radius-*` aliases, and Tailwind's own `--radius-xs`
  through `--radius-3xl` (used directly by around twenty-five `rounded-*`
  utilities in feature code). `--corner-round` is left alone because it draws
  circles (presence dots, avatar fallbacks), which are shapes, not corners.
- Elevation: `--shadow-xs` and `--shadow-sm` to `none`. `--shadow-panel`
  becomes a 1px ring in `--border-standard`, so the workspace panel keeps its
  edge, drawn instead of cast.
- Texture: `--texture-dots-color` set to `--bg-app`, which makes the shell's
  dot pattern invisible without touching the pattern's consumers.

Elevation and texture are declared per mode upstream, so the overlay declares
them for `:root`, `:root[data-color-mode="dark"]` and `.dark` together. A
single `:root` declaration would be overridden by upstream's dark block.

### Typography

`--font-sans` is re-declared with Barlow first and Inter still behind it. Inter
stays because the Barlow files are the Latin subset only; a glyph outside it,
or a screen that paints before the font loads, falls back to Inter instead of
the system font. The Latin subset covers Icelandic.

`--font-heading` (Barlow Condensed) is a new role with no upstream consumer. It
exists so fork-owned surfaces can use the condensed face without inventing a
font-family literal, which `check-app-foundations` would reject in feature CSS.
Applying it to upstream's label and caption type roles is a deliberate
non-goal: it would mean editing `typography.css`.

The fonts are self-hosted because the desktop CSP in `src-tauri/tauri.conf.json`
is `default-src 'self'`. Google Fonts and the Adobe kit that serves BC Barell
are blocked, so the wordmark face is not available in-app at all. The files are
the `@fontsource` Latin subsets; `OFL.txt` is their licence.

### Why three imports

Buzz has three stylesheet entries, and `tokens.css` is imported by each:

1. `src/shared/styles/globals.css`, the app bundle, imported from `main.tsx`.
2. `src/shared/design-system/styles/globals.css`, the design-system viewer.
3. `src/app/startup.css`, linked directly from `index.html` so the first paint
   has tokens before the bundle arrives.

The third one is the trap. `index.html` links `startup.css` as a separate
stylesheet, and it re-imports `tokens.css`. If the overlay is missing from
`startup.css`, the later copy of `tokens.css` redeclares every corner, shadow
and texture role and wins by source order. Fonts and the accent survive, because
the accent is a selector and the font role is not redeclared there, so the
regression is easy to miss: the app looks branded but has rounded corners and
shadows. The overlay must be the last import in all three files.

### Default and bootstrap

The accent default is declared twice on purpose: `DEFAULT_ACCENT` in
`accent.ts` for the app, and the literal in `public/appearance-init.js`, which
sets `data-accent` on `<html>` before paint and cannot import the module.
`service.test.ts` runs the bootstrap in a VM and checks it agrees with the
service, so a mismatch fails tests rather than flashing the wrong accent.

Legacy mapping is untouched: a saved bubble colour `"jade"` from an old Buzz
build still maps to Citrus, as upstream decided. Only an unrecognised or absent
value falls to the fork default.

## What the guards cover

`pnpm design:check` passes at the fork head. What each guard does with the
overlay:

| Guard | Covers | Note |
| --- | --- | --- |
| `check-color.mjs` | no colour literals outside `tokens.css`; accent mappings reference named owners | Its per-family ramp check lists upstream's families by name and does not include `minni`. See [Known gaps](#known-gaps). |
| `check-contrast.mjs` | every text and control pairing, both modes, for every accent family | Discovers families from `[data-accent="…"]` selectors, so `minni` is checked automatically. This is the guard that rejected `#4e8a78`. |
| `check-app-foundations.mjs` | no literal colours, fonts, sizes in feature CSS | Skips `src/shared/design-system`, so the overlay's `@font-face` is allowed there and nowhere else. |
| `check-adoption.mjs` | feature code uses roles, not palette steps; feature CSS does not repaint shared controls | Its palette regex lists upstream's families by name and does not include `minni`. See [Known gaps](#known-gaps). |
| `tokens.test.ts` | per-accent role resolution, High and Low contrast, colour levels | Iterates `ACCENTS`, so `minni` is included. Parses `tokens.css` only, so the overlay's radius and shadow overrides are not seen. |
| `brand.test.ts` | palette families have light and dark owners in the right sections | `PALETTE_FAMILIES` derives from `ACCENTS`, so `minni` is included. |
| `service.test.ts` | bootstrap and service agree on default, key and legacy mapping | Reads `DEFAULT_ACCENT`. |

Nothing checks that the overlay is imported in all three entries, or that the
role names it overrides still exist. See below.

## Merging upstream

Remotes: `origin` is `minniai/minni-buzz-app`, `upstream` is `block/buzz-app`.
`main` tracks upstream unchanged; the brand lives on `minni/brand-overlay`.

```sh
git fetch upstream
git checkout main
git merge --ff-only upstream/main
git push origin main
git checkout minni/brand-overlay
git rebase main        # or: git merge main, once the branch is shared
```

While the overlay is a single commit, rebasing keeps the whole fork diff
readable as `git diff main..minni/brand-overlay`. Once others build on the
branch, merge instead and never rewrite.

### After every merge

1. **Conflicts in `tokens.css`.** Expected only if upstream edited the lines
   adjacent to a fence. Resolve by keeping upstream's change and re-placing the
   fenced block after it; the block's content never needs to change for an
   upstream edit. If upstream added an eighth accent, the fork's block still
   goes last.
2. **Re-read `brand/minni.css` against upstream's token sections.** The overlay
   names roles. If upstream renames `--corner-panel`, `--shadow-panel`,
   `--texture-dots-color` or the `--radius-*` scale, the override silently
   stops applying and no guard notices. Check the Corner, Elevation and Texture
   sections of `tokens.css` (search for `--- Corner`, `--- Elevation`,
   `--texture-dots`) and the `@theme` radii in Layer 3 whenever the merge
   touched them:

   ```sh
   git diff ORIG_HEAD..HEAD -- src/shared/design-system/styles/tokens.css | grep -E '^[-+].*(--corner-|--radius-|--shadow-|--texture-)'
   ```

3. **Check the three imports survived.** A new upstream import added at the end
   of any entry lands after the overlay:

   ```sh
   for f in src/shared/styles/globals.css src/shared/design-system/styles/globals.css src/app/startup.css; do
     grep -n '@import' "$f" | tail -1
   done
   ```

   Each last line must be the `brand/minni.css` import.
4. **Check the bootstrap.** If upstream changed `appearance-init.js` (a new
   accent, a new legacy mapping), re-apply the two fork lines and run
   `service.test.ts`.
5. **Run the checks.**

   ```sh
   bin/pnpm check
   bin/pnpm vitest run src/shared/design-system src/shared/theme src/app
   ```

6. **Look at the running app** in light and dark. The things no test sees:
   square corners on the panel, no dot texture, Barlow in body text, the jade
   send button. The design-system viewer (`just design`) shows the same roles
   in isolation.

### If upstream changes the accent system

The fork follows upstream's shape, not the other way round. If upstream adds
steps, renames `--accent-ink`, or moves the accent blocks to another file, port
the `minni` family to the new shape in the same merge. The ramp values in the
table above are the specification; the CSS is derived.

## Changing the brand

- **A colour value.** Edit the literal in the first fenced block of
  `tokens.css`. Both bindings and the accent block reference owners, so one
  edit flows through. Run `check-contrast` before committing; it will tell you
  if the new value fails a pairing and on which surface.
- **A corner, shadow or texture.** Edit `brand/minni.css`. Keep it to role
  names; if you need a literal, the value belongs in `tokens.css` as a new
  owner, and the overlay references it.
- **A font.** Add the woff2 to `public/fonts/minni/`, add its `@font-face` to
  the overlay, and keep the Inter fallback. Check the licence file.
- **A new brand-specific role.** Declare it in the overlay with a descriptive
  name like `--font-heading`, referencing existing tokens. Feature code then
  uses `var(--font-heading)`, which `check-app-foundations` accepts. Never
  reference a palette step such as `--minni-9` from feature code; that is the
  direct-palette rule, and for this family it is enforced by review only. See
  [Known gaps](#known-gaps).

## Not covered by this overlay

These are brand surfaces the overlay leaves as upstream ships them. Each is a
separate decision with its own cost; the research report in AKB tiers them.

- App name, bundle identifier `xyz.block.buzz.desktop`, deep-link scheme
  `buzz://`, updater key and endpoint. The identifier is hard-coded in Rust in
  three places. Changing it is a pre-release decision that also changes where
  the app stores keys.
- Icons under `src-tauri/icons/` and `public/`, the onboarding wordmark and its
  WebGL shader, the share-card mark, and the launch overlay's SMIL timing.
- Upstream's dark neutrals. The overlay rebinds the accent only; the ink ground
  is still Buzz's.
- The "Buzz" strings in the UI. Upstream has over two hundred across more than
  a hundred files; a global rename is a permanent merge tax.
- UI icons stay Tabler. The repo lint enforces the import boundary, and the
  brand's Lucide guidance is close enough in weight not to matter in-app.
- Apache-2.0 section 6: the licence grants no trademark rights. Shipping the
  fork under a different name requires replacing Block's marks, not only
  recolouring around them.

## Known gaps

- Two guards name upstream's accent families in a literal list and do not know
  `minni`. In `check-color.mjs` the ramp-owner check skips the jade ramp, so a
  missing owner would be caught by `brand.test.ts` and `check-contrast` but
  not here. In `check-adoption.mjs` the direct-palette regex skips it, so a
  `--minni-9` or `bg-minni-9` in feature code passes the guard. Adding
  `"minni"` to each list is one line, and one more fork touch in a script
  file; neither has been done.
- No test asserts that the overlay is imported last in all three entries or
  that the roles it overrides exist. Both are cheap to add as a fork-owned
  Vitest file that reads the three entries and `tokens.css`; this would be the
  first fork-only test.
- `--font-heading` has no consumer and no viewer specimen.
- The wordmark face (BC Barell) cannot load under the CSP. Any in-app wordmark
  must be an SVG asset.
