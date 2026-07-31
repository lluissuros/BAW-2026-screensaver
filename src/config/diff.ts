/**
 * Reduces a config to just what differs from a baseline.
 *
 * This is what keeps a share link around a hundred characters instead of three kilobytes, and
 * what makes a committed look read as a short list of intentions rather than a dump of every
 * parameter in the app. `migrate()` fills the missing fields back in, so a partial config is
 * already a valid stored form — this only takes advantage of that.
 *
 * Deliberately has **no imports at all** beyond a type: `scripts/add-look.mjs` loads it directly
 * in Node, which resolves ESM specifiers differently from Vite. Keeping it dependency-free means
 * the browser and the CLI share one implementation instead of drifting apart.
 */

import type { Config } from './types'

/** Layers stay positional: an unchanged one becomes `{}` so later indices still line up. */
export function minimalAgainst(config: Config, base: Config): Record<string, unknown> {
  const changed = (diffValue(config, base) ?? {}) as Record<string, unknown>
  // The name is what the look is called, not a deviation from anything, so it always survives.
  return { ...changed, name: config.name }
}

export function diffValue(value: unknown, base: unknown): unknown | undefined {
  if (Array.isArray(value)) {
    if (!Array.isArray(base)) return value
    const items = value.map((item, i) => diffValue(item, base[i]) ?? {})
    const anyChanged = items.some((item) => Object.keys(item as object).length > 0)
    return anyChanged || value.length !== base.length ? items : undefined
  }
  if (isPlainObject(value)) {
    if (!isPlainObject(base)) return value
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      const delta = diffValue(inner, base[key])
      if (delta !== undefined) out[key] = delta
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  return value === base ? undefined : value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
