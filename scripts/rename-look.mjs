/**
 * Renames a published look.
 *
 *   npm run rename-look -- --slug=test1 --name='bruno big'
 *   npm run rename-look -- --number=3 --name='audio smooth'
 *
 * Options: --slug or --number to pick the look, --name for the new one, --dry-run.
 *
 * Looks submitted through an issue arrive named whatever the submitter typed, which is often
 * "test1". This fixes the display name and the pretty route in one step.
 *
 * **The numeric prefix is kept**, so `/3/` still opens the same look afterwards. The named route
 * does change — `/test1/` becomes `/bruno-big/` — so a link shared in the `/slug/` form will
 * break, while the numbered one will not. That is the reason numbers exist.
 */

import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PRESET_DIR = 'src/presets'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=')
      return [k, rest.join('=') || 'true']
    }),
)

function slugify(name) {
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return cleaned || 'look'
}

const files = readdirSync(PRESET_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((file) => {
    const stem = file.replace(/\.json$/, '')
    return { file, stem, prefix: stem.match(/^(\d+)-/)?.[1] ?? '', slug: stem.replace(/^\d+-/, '') }
  })

if (!args.name) {
  console.error('Need --name with the new name.\n')
  console.error('Published looks:')
  for (const f of files) console.error(`  /${Number(f.prefix)}/  ${f.slug}   (${f.file})`)
  process.exit(1)
}

const target = args.slug
  ? files.find((f) => f.slug === args.slug)
  : args.number
    ? files.find((f) => Number(f.prefix) === Number(args.number))
    : undefined

if (!target) {
  console.error(`No published look matches ${args.slug ? `--slug=${args.slug}` : `--number=${args.number}`}.\n`)
  console.error('Published looks:')
  for (const f of files) console.error(`  /${Number(f.prefix)}/  ${f.slug}   (${f.file})`)
  process.exit(1)
}

const newName = args.name.trim().slice(0, 60)
const newSlug = slugify(newName)

if (newSlug !== target.slug && files.some((f) => f.slug === newSlug)) {
  console.error(`There is already a look at /${newSlug}/. Pick a different name.`)
  process.exit(1)
}

const oldPath = join(PRESET_DIR, target.file)
const newFile = `${target.prefix ? `${target.prefix}-` : ''}${newSlug}.json`
const newPath = join(PRESET_DIR, newFile)

const data = JSON.parse(readFileSync(oldPath, 'utf8'))
data.name = newName
const body = `${JSON.stringify(data, null, 2)}\n`

if (args['dry-run'] === 'true') {
  console.log(`would write ${newPath}:\n${body}`)
  if (newPath !== oldPath) console.log(`would remove ${oldPath}`)
} else {
  writeFileSync(oldPath, body)
  if (newPath !== oldPath) renameSync(oldPath, newPath)
  console.log(`${target.file} → ${newFile}`)
}

const number = Number(target.prefix)
console.log(`\n“${newName}”`)
if (number > 0) console.log(`  /${number}/ still opens it — that link keeps working`)
console.log(`  /${newSlug}/ is the new named route`)
if (newSlug !== target.slug) console.log(`  /${target.slug}/ will stop working`)
if (args['dry-run'] !== 'true') console.log('\nCommit and push, and the deploy picks it up.')
