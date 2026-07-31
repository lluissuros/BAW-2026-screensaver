# AGENTS.md — BAW! 2026 pantalles

Personal project, no company context. See `../AGENTS.md` for the wider rules of
`_personal_lluis`. Commit as `lluissuros@gmail.com`.

## What this is

An animated screen for a small arts festival, built on artwork somebody else made. Read
`README.md` first — it covers the modes, the keys, the measured composition and the export path.

## The rule that outranks the others

**The artwork is not ours to improve.** The colours, the shapes and the composition came from
the artist. Code here moves and deforms them; it does not redraw, restyle, recolour or
"clean up" them.

Concretely:

- Don't vectorise or retrace `forma bruno 1`. The irregular edge and the streaks inside the
  stroke are the artwork. It stays a raster warped in a shader.
- Don't add visual elements the artist didn't draw — gradients, glows, shadows, extra shapes,
  a vignette turned on by default. Effects may exist as controls at 0; they may not be assumed.
- Don't change the palette in `src/config/defaults.ts`. Those four hex values were sampled from
  the designer's files.
- Defaults stay subtle. The brief was "contracts a little, deforms a little, keeping its
  structure". If a change makes the first frame more dramatic, it probably belongs behind a
  control rather than in the defaults.

## Architecture, briefly

- `src/config/` — `Config` is the single source of truth for everything visible. `schema.ts`
  describes the controls, and the edit panel is *generated* from it: adding a knob means adding
  one line there, and serialization/presets follow for free. Don't hand-write panel markup.
- `src/engine/` — WebGL2. Layers compose into an offscreen target at the *design* resolution,
  then get fitted to the real screen. That is why a preset made on a laptop looks identical on
  the venue's panel, and why the exporter gets exact pixel dimensions.
- `src/drive/` — both synthetic motion and live audio produce the same `Drive`. Nothing
  downstream knows which is in charge.
- `src/ui/`, `src/export/` — panel, canvas interaction, overlay, video recorder.

## Storage: there is no backend, and there must not be one

A look is stored in its URL. `src/config/diff.ts` reduces a config to what differs from the
reference, `store.ts` base64s that into the hash, and `migrate()` fills the rest back in. That is
the entire persistence layer, and it is why a non-technical visitor can save something without an
account and why the site costs nothing to run.

Consequences to respect:

- **Never add a required service.** No database, no auth, no API. If a feature seems to need one,
  it can almost certainly be expressed as a link, a committed file, or a build-time artifact.
- **`src/config/diff.ts` has no imports** beyond a type, because `scripts/add-look.mjs` loads it
  directly in Node (whose ESM resolution differs from Vite's). Keep it that way, or the CLI and
  the browser will drift into two implementations of the same thing.
- **Route numbering lives in two places** — `publishedLooks()` and `scripts/build-site.mjs` — and
  both must sort by *filename*, prefix included. They disagreed once and `/3` in the gallery
  opened a different look than `/3/` did.
- **Anything decoded from a link is hostile input.** `scripts/add-look.mjs` rebuilds it against
  the shape of `defaultConfig()`. Extend that sanitiser when you add a config field, especially
  one that becomes a GPU allocation or a filename.

## The two invariants worth protecting

1. **Every animation rate is a whole number of cycles per loop.** That is the only reason the
   motion is seamless and the exported video is a true loop. If you add an effect, its rate
   control must be integer-stepped and it must be a function of `phase`, never of wall time.
2. **Show mode must need nothing.** No audio device, no permission, no network, no localStorage,
   no server. Anything new must degrade to "still runs, still looks alive".

## Verifying changes

Claude cannot see whether the motion looks good — say what was measured, not how it looks.

```bash
npm run check                                   # types
node scripts/contact-sheet.mjs                  # renders the loop at N phases into one strip
```

The dev build exposes `window.baw` (`store`, `drive`, `renderer`, `panel`, `recordLoop`), which
is how the contact sheet drives the real renderer through headless Chrome rather than
re-implementing the maths. Use it for any visual check.

Two checks that have already caught real problems and are worth repeating after touching layout
or export:

- **Ghost alignment** — freeze motion (`intensity` 0), set the reference ghost to 1, screenshot.
  It blends with `difference`, so a correct layout is black apart from 1–2px edges.
- **Frame accuracy** — record a short loop and `ffprobe -count_frames` it. `seconds × fps`
  frames exactly, or the "true loop" claim is false.
