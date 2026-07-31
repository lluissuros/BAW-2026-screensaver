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
 * Published looks are ordered by filename, and `scripts/build-site.mjs` numbers the routes the
 * same way — the two must agree or `/3` in the gallery would open something else.
 */

const LOCAL_KEY = 'baw2026.presets'
const AUTOSAVE_KEY = 'baw2026.working'

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
      return { file, name: config.name || slug, slug, source: 'builtin' as const, config }
    })
    // Sort by *filename*, prefix included — the same order scripts/build-site.mjs numbers the
    // routes in. Sorting by slug instead would silently make `/3` here open a different look.
    .sort((a, b) => a.file.localeCompare(b.file))
    .map(({ file: _file, ...entry }, index) => ({ ...entry, number: index + 1 }))
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

/** Keeps in-progress edits across a reload, so a stray refresh mid-session costs nothing. */
export function saveWorking(config: Config): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(minimalConfig(config)))
  } catch {
    /* ignore */
  }
}

export function loadWorking(): Config | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    return raw ? migrate(JSON.parse(raw)) : null
  } catch {
    return null
  }
}
