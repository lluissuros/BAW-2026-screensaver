# BAW! 2026 — pantalles

An animated screen for **BAW! — Brava! Arts Weekend 2026**. It takes the festival's own
artwork — the hand-painted *forma bruno 1*, the BAW! logo, the hand lettering — and makes it
breathe, so the screens have something alive on them while the music plays instead of a static
image.

Two modes, one page:

- **show mode** (the default) — the composition, full screen, nothing else. No controls, no
  cursor, no UI to accidentally leave on a projector.
- **edit mode** (press <kbd>E</kbd>) — every size, position and movement is adjustable live,
  with the artist's original composition available as a tracing ghost. Save what you like as a
  preset, press <kbd>E</kbd> again, and it's a clean screen.

It can also record itself as a **seamless video loop**, for the case where the screens are fed
by a media player rather than a browser.

## Quick start

```bash
npm install
npm run dev          # then open the printed URL
```

Then: <kbd>E</kbd> to edit, <kbd>F</kbd> for full screen.

To hand it to someone else, or to run it off a USB stick:

```bash
npm run build        # produces dist/, self-contained, relative paths
```

## Keys

| Key | Does |
| --- | --- |
| <kbd>E</kbd> | Show / hide the edit panel |
| <kbd>F</kbd> | Full screen |
| <kbd>Esc</kbd> | Leave edit mode |
| <kbd>Space</kbd> | Pause the animation (handy while positioning things) |
| <kbd>G</kbd> | Toggle the reference ghost |
| <kbd>1</kbd>–<kbd>9</kbd> | Select a layer |
| <kbd>←↑↓→</kbd> | Nudge the selected layer (hold <kbd>Shift</kbd> for bigger steps) |

On the canvas: **drag** to move a layer, **wheel** to resize it, **shift+wheel** to rotate.

## The artwork

Colours sampled from the artist's own files, not eyeballed:

| | Hex | Where |
| --- | --- | --- |
| Background fuchsia | `#fb80a4` | the whole field |
| Logo red | `#e50000` | BAW! |
| Painted red | `#f00000` | forma bruno 1 |
| Ink red | `#ce1215` | BRAVA! ARTS WEEKEND |

The app opens on the artist's composition. Those defaults are *measured*, not guessed: the
reference (`assets-source/reference-composition.png`, 4253 × 8504, an exact 1:2 portrait) was
masked for red pixels and each element's bounding box read off it.

| Layer | Rect in the reference | Centre | Width | Vertical stretch |
| --- | --- | --- | --- | --- |
| forma bruno 1 | x 1167→3709, y 1162→7645 | 57.3% / 51.8% | 59.8% | 1.125 |
| logo baw 2026 | x 306→3023, y 261→1580 | 39.1% / 10.8% | 63.9% | 1.00 |
| BRAVA! ARTS WEEKEND | x 232→2735, y 7847→8223 | 34.9% / 94.5% | 58.9% | 1.00 |

The forma's 1.125 is not a mistake — the reference composition genuinely stretches it about
12% taller than its natural proportions.

**The artwork stays raster.** The `.ai`/`.pdf` the designer sent contains only embedded
bitmaps, so vectorising would gain nothing from the source, and tracing the forma by hand would
throw away the irregular brush edge and the streaks inside the stroke — which is the artwork.
Instead the PNG is deformed in a shader, so what is on screen is always literally the artist's
own pixels.

## How the motion works

Everything is a function of one number: the **loop phase**, 0 → 1. Every rate in the app is a
whole number of cycles per loop, so the frame at phase 1 is identical to the frame at phase 0.
The result never restarts visibly, and an exported video is a true loop rather than an
approximate one.

Each layer has two families of movement:

**Moves as a whole** — the artwork is untouched, only its transform changes.
`breathe` (scale in and out) · `pulse` (a kick on each beat) · `squash` (taller and thinner,
then wider and shorter) · `sway` (rotation) · `drift` (slow travel on a closed path).

**Deforms the artwork** — done in the fragment shader, on the texture itself.
`wobble` (domain-warped noise displacement, the wet-paint flex — low *wobble scale* makes the
whole body flex, high makes the edges chatter) · `ripple` (a travelling wave along the long
axis) · `bleed` (dilates and erodes the painted edge like ink).

Defaults are deliberately small. The brief was "it contracts a little, deforms a little,
keeping its structure" — not an algorithmic fantasy. Turn **Intensity** up to explore, and to 0
to freeze the composition entirely.

`bleed` is the one effect that *resamples* the painted edge rather than moving it, so it
starts at 0. Dial it in on purpose.

## Audio

Off by default, and that is intentional: the machine driving the screen may have no audio
input, no permission granted, and nobody around to fix it. Without audio the loop drives itself
and always looks alive.

Turn on **Listen to audio input** in the panel to use a microphone pointed at the room, or a
loopback device (BlackHole, Loopback) if the music plays on the same machine. It feeds the same
`energy / bass / mid / high / beat` bus the synthetic motion uses, with per-band auto-ranging so
it doesn't matter how loud the room is. **Audio takeover** crossfades between the two, so you
can have mostly-autonomous motion with a little reactivity on top.

If permission is denied the app says so and carries on synthetically.

## Presets

- **Built-in** — JSON files in `src/presets/`. These survive a new machine, a fresh browser
  profile and a cleared cache, which is what matters on the day. Partial files are fine;
  anything missing falls back to the defaults.
- **Local** — saved from the panel into this browser's storage. Quick to scribble, tied to one
  machine. Use **Download JSON** to promote one into `src/presets/` and commit it.
- **Copy link** puts the entire look in a URL, which is the fastest way to send a version to
  someone else.

Edits also autosave, so a stray reload mid-session loses nothing. `?fresh=1` ignores that,
`?preset=<name>` opens a specific one, `?edit=1` opens with the panel already out.

## Exporting a video loop

**Export video loop** in the panel records exactly one cycle at the design resolution and
downloads a `.webm`. Frames are pushed one at a time rather than sampled, so the file contains
exactly the frames that were drawn — no duplicates, no drops. Recording takes as long as the
loop itself, because the browser's encoder timestamps by wall clock.

Then convert for whatever plays it back:

```bash
# H.264 mp4 — plays anywhere
ffmpeg -i baw.webm -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart baw.mp4

# ProRes 422 HQ — for Resolume / VLC / a hardware player, no recompression artefacts
ffmpeg -i baw.webm -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le baw.mov
```

The file has no audio track, which is what a looping player wants.

## Assets

Originals from the designer live in `assets-source/`. `npm run assets` turns them into web
textures in `src/assets/`: it finds each one's real bounding box (the originals are 11811²
with the art floating in transparency — 139 megapixels, more than a GPU will take), crops to
it, downscales the long side to 2048, and adds an 8px transparent border so shader warping can
reach outside the shape without smearing its edge.

To add a new element: drop the PNG into `assets-source/`, run `npm run assets`, and it appears
in the panel's **Artwork** dropdown automatically.

## Checking it

```bash
npm run check                     # types
node scripts/contact-sheet.mjs    # renders the loop at 6 phases into one strip
```

The contact sheet drives the real renderer through a headless browser, so it shows what the
motion is actually doing without watching a full cycle. It needs `npm run dev` running.

## On the day

- Open the built page, load the preset you want, press <kbd>E</kbd> to hide the panel, then
  <kbd>F</kbd>. Show mode hides the cursor.
- Set **Canvas width/height** to the screen's real resolution if you know it; the ratio is what
  matters and it defaults to the artist's 1:2. Anything left over is filled with the background
  fuchsia, not black.
- If the GPU context is lost the page reloads itself, so an unattended machine recovers.
- Keep a rendered video as a fallback.
