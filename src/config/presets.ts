import type { Config } from './types'
import { migrate, minimalConfig } from './store'

/**
 * A "look" is a named Config. There are two kinds, and the difference matters:
 *
 *  - **published** — JSON files committed in `src/presets/`. The build gives each one a real
 *    URL: `/1`, `/2`, … in file order, plus `/<slug>`. These survive a new machine, a fresh
 *    browser profile and a cleared cache, which is what matters on the day of the festival.
 *  - **saved here** — kept in this browser's storage. Anyone can make these by moving sliders,
 *    with no account and nothing to install, but they live on one machine only. The way one
 *    becomes permanent is its share link: see `scripts/add-look.mjs`.
 *
 * A published look's number is its filename prefix: `02-test1.json` is `/2/` and `/test1/`.
 * `scripts/build-site.mjs` reads it the same way — the two must agree or `/2` in the gallery would
 * open something else. Using the prefix rather than the position means deleting a look never
 * renumbers the ones after it, so links already sent out keep working.
 */

const LOCAL_KEY = 'baw2026.presets'

const builtinFiles = import.meta.glob('../presets/*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>

export interface PresetEntry {
  name: string
  /** URL-safe id. For published looks it is the filename, which is also its route. */
  slug: string
  source: 'builtin' | 'local'
  config: Config
  /** 1-based route number. Only published looks have one. */
  number?: number
}

export function slugify(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents rather than turning them into dashes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return cleaned || 'look'
}

function readLocal(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function writeLocal(all: Record<string, unknown>): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all))
  } catch {
    // Private browsing or a full quota. Share links still work, which is the important path.
  }
}

/** The committed looks, in the same order the site numbers their routes. */
export function publishedLooks(): PresetEntry[] {
  return Object.entries(builtinFiles)
    .map(([path, data]) => {
      // `02-calm.json` → slug `calm`, number 2. The numeric prefix is how the route order is
      // controlled without it leaking into the pretty URL.
      const file = path.replace(/^.*\//, '').replace(/\.json$/, '')
      const slug = file.replace(/^\d+-/, '')
      const config = migrate(data)
      // The number comes from the prefix, not from the position in the list. Positional
      // numbering meant deleting a look silently renumbered every one after it, breaking links
      // that had already been sent out.
      const prefix = file.match(/^(\d+)-/)?.[1]
      return {
        file,
        name: config.name || slug,
        slug,
        source: 'builtin' as const,
        config,
        number: prefix ? Number(prefix) : undefined,
      }
    })
    .sort((a, b) => a.file.localeCompare(b.file))
    .map(({ file: _file, ...entry }) => entry)
}

/** Looks saved in this browser. Newest first — people want their latest attempt on top. */
export function localLooks(): PresetEntry[] {
  return Object.entries(readLocal())
    .map(([name, data]) => ({
      name,
      slug: slugify(name),
      source: 'local' as const,
      config: migrate(data),
    }))
    .reverse()
}

export function listPresets(): PresetEntry[] {
  return [...publishedLooks(), ...localLooks()]
}

export function findPreset(nameOrSlug: string): PresetEntry | undefined {
  const wanted = nameOrSlug.toLowerCase()
  return listPresets().find((p) => p.slug.toLowerCase() === wanted || p.name.toLowerCase() === wanted)
}

export function saveLocalPreset(name: string, config: Config): void {
  const all = readLocal()
  // Re-inserting moves it to the end, which `localLooks` reverses into "most recent first".
  delete all[name]
  all[name] = { ...minimalConfig(config), name }
  writeLocal(all)
}

export function deleteLocalPreset(name: string): void {
  const all = readLocal()
  delete all[name]
  writeLocal(all)
}

export type RenameResult = 'ok' | 'missing' | 'taken'

/**
 * Renames a look saved in this browser. Rebuilt key by key rather than deleted and re-added, so
 * the look keeps its place in the list instead of jumping to the top as if it were new.
 */
export function renameLocalPreset(from: string, to: string): RenameResult {
  const trimmed = to.trim()
  if (!trimmed) return 'taken'
  const all = readLocal()
  if (!(from in all)) return 'missing'
  if (trimmed !== from && trimmed in all) return 'taken'

  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(all)) {
    if (key === from) next[trimmed] = { ...(value as Record<string, unknown>), name: trimmed }
    else next[key] = value
  }
  writeLocal(next)
  return 'ok'
}
