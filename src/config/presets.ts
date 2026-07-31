import type { Config } from './types'
import { migrate } from './store'
import { defaultConfig } from './defaults'

/**
 * Two kinds of preset:
 *
 *  - **built-in** — JSON files committed in `src/presets/`. These survive a new machine, a
 *    fresh browser profile and a cleared cache, which is what matters on the day of the
 *    festival. Save the looks you actually want to use as files.
 *  - **local** — saved into localStorage from the panel. Fast to scribble, but tied to one
 *    browser on one machine. Use "Download JSON" to promote one into `src/presets/`.
 */

const LOCAL_KEY = 'baw2026.presets'
const AUTOSAVE_KEY = 'baw2026.working'

const builtinFiles = import.meta.glob('../presets/*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>

export interface PresetEntry {
  name: string
  source: 'builtin' | 'local'
  config: Config
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
    // Private browsing or a full quota — built-in presets and JSON download still work.
  }
}

export function listPresets(): PresetEntry[] {
  const builtin: PresetEntry[] = Object.entries(builtinFiles).map(([path, data]) => {
    const config = migrate(data)
    const fallback = path.replace(/^.*\//, '').replace(/\.json$/, '')
    return { name: config.name || fallback, source: 'builtin', config }
  })
  const local: PresetEntry[] = Object.entries(readLocal()).map(([name, data]) => ({
    name,
    source: 'local',
    config: migrate(data),
  }))
  return [...builtin, ...local].sort((a, b) => a.name.localeCompare(b.name))
}

export function findPreset(name: string): PresetEntry | undefined {
  return listPresets().find((p) => p.name.toLowerCase() === name.toLowerCase())
}

export function saveLocalPreset(name: string, config: Config): void {
  const all = readLocal()
  all[name] = { ...config, name }
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
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(config))
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

export function clearWorking(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
  } catch {
    /* ignore */
  }
}

export function startingConfig(): Config {
  return defaultConfig()
}
