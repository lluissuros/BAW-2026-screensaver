import type { Config, LayerConfig } from './types'
import { defaultConfig } from './defaults'

type Listener = (config: Config) => void

/** Reads a dotted path like `layers.0.motion.wobble`. */
export function getPath(root: unknown, path: string): unknown {
  let node: unknown = root
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

/** Writes a dotted path in place. Returns true if the value actually changed. */
export function setPath(root: unknown, path: string, value: unknown): boolean {
  const keys = path.split('.')
  const last = keys.pop()
  if (!last) return false
  let node: unknown = root
  for (const key of keys) {
    if (node === null || typeof node !== 'object') return false
    node = (node as Record<string, unknown>)[key]
  }
  if (node === null || typeof node !== 'object') return false
  const target = node as Record<string, unknown>
  if (target[last] === value) return false
  target[last] = value
  return true
}

export class Store {
  config: Config
  private listeners = new Set<Listener>()

  constructor(config: Config = defaultConfig()) {
    this.config = config
  }

  get(path: string): unknown {
    return getPath(this.config, path)
  }

  set(path: string, value: unknown): void {
    if (setPath(this.config, path, value)) this.emit()
  }

  /** Swaps the whole config — used when loading a preset. */
  replace(config: Config): void {
    this.config = config
    this.emit()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(): void {
    for (const fn of this.listeners) fn(this.config)
  }

  clone(): Config {
    return structuredClone(this.config)
  }
}

/**
 * Fills anything missing in a loaded config from the current defaults, so a preset saved by
 * an older build still opens instead of rendering a black screen.
 */
export function migrate(input: unknown): Config {
  const base = defaultConfig()
  if (input === null || typeof input !== 'object') return base
  const raw = input as Partial<Config>

  const layerTemplate = base.layers[0]!
  const layers: LayerConfig[] = Array.isArray(raw.layers)
    ? raw.layers.map((layer, i) => ({
        ...layerTemplate,
        ...(base.layers[i] ?? layerTemplate),
        ...layer,
        motion: { ...layerTemplate.motion, ...(base.layers[i]?.motion ?? {}), ...(layer?.motion ?? {}) },
      }))
    : base.layers

  return {
    version: base.version,
    name: typeof raw.name === 'string' ? raw.name : base.name,
    canvas: { ...base.canvas, ...(raw.canvas ?? {}) },
    motion: { ...base.motion, ...(raw.motion ?? {}) },
    audio: { ...base.audio, ...(raw.audio ?? {}) },
    post: { ...base.post, ...(raw.post ?? {}) },
    layers,
  }
}

// ── URL sharing: the whole config travels in the hash, so a look can be handed to another
// machine by copying a link, with no server and no file. ──

export function encodeConfig(config: Config): string {
  const bytes = new TextEncoder().encode(JSON.stringify(config))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeConfig(encoded: string): Config | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return migrate(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  }
}
