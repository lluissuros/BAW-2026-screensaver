/**
 * Builds the publishable site: the app, plus a real URL for every committed look.
 *
 *   npm run build:site
 *
 * GitHub Pages serves static files and nothing else, so "each version has its own address"
 * has to be arranged at build time. For every file in `src/presets/` this writes two pages:
 *
 *   dist/3/index.html        → the third look, by filename order
 *   dist/calm/index.html     → the same look, by name
 *
 * Each is the built index.html with one line injected that tells the app which look to open.
 * Same bundle, same cached assets, no router, no server.
 *
 * The numbering must match `publishedLooks()` in src/config/presets.ts, which also sorts by
 * filename — otherwise `/3` in the gallery would open something else.
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const REPO_NAME = 'BAW-2026-screensaver'
const base = process.env.BAW_BASE ?? `/${REPO_NAME}/`
const dist = 'dist'

// ── build ──

const build = spawnSync('npx', ['vite', 'build', `--base=${base}`], { stdio: 'inherit' })
if (build.status !== 0) process.exit(build.status ?? 1)

// ── the looks, in the same order the app numbers them ──

const presetDir = 'src/presets'
const looks = readdirSync(presetDir)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => {
    // `02-calm.json` → route /2/ and /calm/. The number is the prefix, not the position, so
    // deleting a look never renumbers the others — see publishedLooks() in src/config/presets.ts.
    const stem = basename(file, '.json')
    const slug = stem.replace(/^\d+-/, '')
    const number = Number(stem.match(/^(\d+)-/)?.[1] ?? 0)
    const data = JSON.parse(readFileSync(join(presetDir, file), 'utf8'))
    return { slug, name: typeof data.name === 'string' && data.name ? data.name : slug, number }
  })

// ── route pages ──

const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8')

function writeRoute(path, globals) {
  const injected = `<script>${Object.entries(globals)
    .map(([key, value]) => `window.${key}=${JSON.stringify(value)};`)
    .join('')}</script>\n  </head>`
  const html = indexHtml.replace('</head>', injected)
  mkdirSync(join(dist, path), { recursive: true })
  writeFileSync(join(dist, path, 'index.html'), html)
}

for (const look of looks) {
  if (look.number > 0) writeRoute(String(look.number), { __BAW_LOOK__: look.slug })
  if (look.slug !== String(look.number)) writeRoute(look.slug, { __BAW_LOOK__: look.slug })
  console.log(`route /${look.number}/ and /${look.slug}/ → ${look.name}`)
}

writeRoute('gallery', { __BAW_VIEW__: 'gallery' })
console.log('route /gallery/')

// A machine-readable index, so scripts and anyone curious can see what is published.
writeFileSync(join(dist, 'looks.json'), JSON.stringify({ base, looks }, null, 2))

// Unknown paths land on the screensaver rather than a GitHub 404 page.
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'))

// The festival identity is not released yet. The site has to be public for Pages on a free
// account, but it does not have to be indexed.
writeFileSync(
  join(dist, 'robots.txt'),
  ['User-agent: *', 'Disallow: /', ''].join('\n'),
)

console.log(`\nsite ready in ${dist}/ with base ${base}`)
