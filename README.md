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

To run it off a USB stick or any plain file server:

```bash
npm run build        # dist/, self-contained, relative paths
```

To build exactly what gets published, including the numbered routes:

```bash
npm run build:site
npx vite preview --base=/BAW-2026-screensaver/
```

## Keys

| Key | Does |
| --- | --- |
| <kbd>E</kbd> | Show / hide the edit panel |
| <kbd>F</kbd> | Full screen |
| <kbd>Esc</kbd> | Leave edit mode |
| <kbd>Space</kbd> | Pause the animation (handy while positioning things) |
| <kbd>G</kbd> | Toggle the reference ghost |
| <kbd>L</kbd> | Open the gallery of saved looks |
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

## Sharing it — the live site

**https://lluissuros.github.io/BAW-2026-screensaver/**

Every push to `main` rebuilds and redeploys it. The site needs to be public for Pages on a free
account, so it ships a `robots.txt` that keeps the unreleased festival identity out of search
engines — the URL is public but unlisted, so treat it as "anyone I send it to".

Each published look gets real addresses, generated at build time:

| URL | What it is |
| --- | --- |
| `/` | the current default, clean |
| `/1/`, `/2/`, `/3/` … | one per published look, in file order |
| `/reference/`, `/calm/`, `/pulse/` | the same looks, by name |
| `/gallery/` | all of them as a grid, plus whatever the visitor saved |

### On a phone it only shows

Editing needs room for a 336px panel next to the artwork and a pointer you can aim; a phone has
neither — the panel covers the very thing it is adjusting. So on a small or touch-only screen
there is no editor at all, even if the link says `?edit=1` (share links do, for collaborators on
a laptop). You get the composition, full bleed, and one tap to drop the browser chrome.

The gallery still works there, for browsing versions and copying links. `?edit=force` overrides
the check if you ever want the panel on a tablet.

## Looks: how anyone saves one

The point is that somebody who has never opened a code editor can shape the screen and keep it.
No account, nothing installed, no JSON:

1. Open the link. Click **Edit this screen** at the bottom (or press <kbd>E</kbd>).
2. Move sliders.
3. **Save & copy link.** It asks for a name, remembers it in the browser, and puts a link on the
   clipboard.
4. Send that link to anyone. Opening it reproduces the look exactly.

The link *is* the storage — the whole look rides in the URL, which is why this needs no server.
A typical one is about a hundred characters, because only what differs from the reference gets
encoded. The address bar also stays a valid permalink as you edit, so "copy the URL" works at
any moment.

**Looks…** (or <kbd>L</kbd>) opens the gallery: the published looks plus everything saved in this
browser, each as a real rendered thumbnail. From there: open one, copy its link, delete it, or
copy a single link containing *all* your saves to send in one go.

### Making someone's look permanent

Saved-in-browser looks live on one machine. To give one its own number and route:

```bash
npm run add-look -- --url='<the link they sent>' --name='bruno 1'
git add src/presets && git commit -m 'Publish look: bruno 1' && git push
```

It lands at `/4/` and `/bruno-1/` once the deploy finishes. `--dry-run` shows what it would
write. `--all` accepts a collection link carrying several looks at once.

Or let GitHub do it: **Submit** in the gallery opens a pre-filled issue with the link in it.
Adding the `publish-look` label — one tap on a phone — makes
`.github/workflows/publish-look.yml` decode it, commit it and reply with the URL. Nothing lands
unattended: without the label, nothing happens.

Incoming links are not trusted. `scripts/add-look.mjs` rebuilds the JSON field by field against
the shape of `defaultConfig()`, so unknown keys are dropped, types are enforced, canvas sizes are
clamped and asset names are checked against the files that exist. A hostile link can produce an
ugly look and nothing else.

### Where looks live

- **Published** — `src/presets/NN-slug.json`, committed. The `NN` prefix picks the route number
  and is stripped from the pretty URL, so `02-calm.json` is `/2/` and `/calm/`. Files are
  partial: anything absent falls back to the reference, which makes them short and readable.
- **Saved on this device** — the browser's storage. Free to make, tied to one machine.

Edits autosave too, so a stray reload mid-session loses nothing. `?fresh=1` ignores that,
`?preset=<slug>` opens a specific one, `?edit=1` opens with the panel out, `?gallery=1` opens the
grid.

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
