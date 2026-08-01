import './style.css'

import { defaultConfig } from './config/defaults'
import { parseCollection } from './config/links'
import { findPreset, publishedLooks } from './config/presets'
import { decodeConfig, encodeConfig, Store } from './config/store'
import type { Config } from './config/types'
import { DriveBus } from './drive'
import { Renderer } from './engine/renderer'
import { ThumbnailRenderer } from './engine/thumbnail'
import { recordLoop } from './export/recorder'
import { canEdit, isTouchPrimary } from './ui/device'
import { Gallery } from './ui/gallery'
import { attachInteractions } from './ui/interact'
import { Overlay } from './ui/overlay'
import { Panel, type EditTools } from './ui/panel'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
const uiRoot = document.querySelector<HTMLElement>('#ui')!
const params = new URLSearchParams(location.search)

/** Looks that arrived on a collection link, held for the gallery to offer. */
const receivedLooks: Config[] = []

const store = new Store(resolveInitialConfig())
const drive = new DriveBus()
const renderer = new Renderer(canvas)
await renderer.load()

const overlay = new Overlay(uiRoot)
const tools: EditTools = { ghost: 0, bounds: true }

const thumbnails = new ThumbnailRenderer()

/**
 * Whether this device gets an editor at all. On a phone it does not: the panel would cover the
 * composition, and a shared link (which carries `?edit=1` for collaborators on a laptop) should
 * open as a clean display instead.
 */
const editable = canEdit(params)

let editing = editable && params.has('edit')
let selected = 0
let exporting = false
let hintTimer = 0
let permalinkTimer = 0
let lastFrameAt = performance.now()

const panel = new Panel(uiRoot, store, {
  drive,
  tools,
  onToolsChange: applyTools,
  onFieldChange: (path) => {
    if (path === 'audio.enabled') void syncAudio()
  },
  onExportVideo: () => void exportVideo(),
  onOpenGallery: () => gallery.open(receivedLooks),
  getSelected: () => selected,
  setSelected: select,
})

const gallery = new Gallery(uiRoot, {
  thumbnails,
  canSave: editable,
  getCurrent: () => store.config,
  onSaveCurrent: () => {
    void panel.saveAndShare().then(() => gallery.refresh())
  },
  onOpen: (config, label) => {
    store.replace(config)
    panel.rebuild()
    panel.status(`Opened “${label}”.`)
    if (editable && !editing) setMode(true)
  },
})

attachInteractions({
  canvas,
  store,
  renderer,
  isEditing: () => editing,
  getSelected: () => selected,
  setSelected: (index) => {
    select(index)
    panel.selectLayer(index)
  },
})

/**
 * The way in. The base URL shows the artwork clean — that is what it is for — so the two things
 * someone might want next live in one small bar: pick a version, or start adjusting.
 *
 * It behaves like a video player's controls: present when you arrive or move, gone when you leave
 * it alone. That way the same page is both a landing page for a stranger and an unattended screen
 * at the festival, with nothing to remember to switch off.
 */
const entry = document.createElement('div')
entry.id = 'entry'

const versionsButton = document.createElement('button')
versionsButton.type = 'button'
versionsButton.textContent = 'See versions'
versionsButton.addEventListener('click', () => gallery.open(receivedLooks))

const separator = document.createElement('span')
separator.className = 'sep'
separator.textContent = '·'

const secondButton = document.createElement('button')
secondButton.type = 'button'
if (editable) {
  secondButton.innerHTML = 'Edit this screen <kbd>E</kbd>'
  secondButton.addEventListener('click', () => setMode(true))
} else {
  // No editor on a phone, so offer the one thing that helps there instead.
  secondButton.textContent = 'Full screen'
  secondButton.addEventListener('click', () => void toggleFullscreen())
}

entry.append(versionsButton, separator, secondButton)
uiRoot.append(entry)

if (isTouchPrimary()) document.body.classList.add('touch')

// Move the mouse or touch the screen and the way in comes back; leave it alone and the artwork is
// on its own again. An unattended screen therefore never shows chrome.
window.addEventListener('pointermove', () => revealEntry(3000))
window.addEventListener('pointerdown', () => revealEntry(5000))

setMode(editing)
applyTools()
resize()
window.addEventListener('resize', resize)
window.addEventListener('keydown', onKeyDown)

// An installation runs for hours on a machine nobody is watching. If the GPU context is lost
// (driver hiccup, the screen sleeping), reload rather than sit there on a frozen frame.
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault()
  setTimeout(() => location.reload(), 1200)
})

store.subscribe((config) => {
  // Keep the address bar a valid permalink at all times, so "copy the URL" is always a way to
  // save and share — no button required, and a reload restores exactly what you were looking at.
  // This is also what replaces the old autosave: the state lives in the URL, not in storage.
  clearTimeout(permalinkTimer)
  permalinkTimer = window.setTimeout(() => {
    history.replaceState(null, '', `${location.pathname}${location.search}#c=${encodeConfig(config)}`)
  }, 600)
})

const routedView = (window as unknown as { __BAW_VIEW__?: string }).__BAW_VIEW__
if (params.has('gallery') || routedView === 'gallery') gallery.open(receivedLooks)

// A handle on the running app for the browser console. Useful while sitting with the artist
// ("try width 62"), and it is how the screenshot checks in scripts/ drive the page.
if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, {
    baw: { store, drive, renderer, tools, panel, setMode, applyTools, recordLoop },
  })
}

revealEntry(6000)
requestAnimationFrame(loop)

// ── loop ──

function loop(now: number): void {
  requestAnimationFrame(loop)
  if (exporting) return

  const dt = Math.min(0.1, Math.max(0, (now - lastFrameAt) / 1000))
  lastFrameAt = now

  const config = store.config
  renderer.render(config, drive.tick(dt, config))

  if (editing) {
    overlay.update(config, window.innerWidth, window.innerHeight, renderer.layerRects(config), selected)
    panel.syncTransport()
  }
}

// ── modes ──

function setMode(edit: boolean): void {
  editing = edit && editable
  document.body.classList.toggle('show-mode', !editing)
  if (editing) entry.classList.remove('visible')
  panel.open(editing)
  overlay.setVisible(editing)
  if (editing) panel.selectLayer(selected)
}

function applyTools(): void {
  overlay.setGhostOpacity(tools.ghost)
  overlay.setBoundsVisible(tools.bounds)
}

function select(index: number): void {
  selected = Math.min(Math.max(0, index), store.config.layers.length - 1)
}

function resize(): void {
  if (exporting) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.max(2, Math.round(window.innerWidth * dpr))
  canvas.height = Math.max(2, Math.round(window.innerHeight * dpr))
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  const typing = target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA'

  if (event.key === 'e' || event.key === 'E') {
    if (typing) return
    setMode(!editing)
    return
  }
  if (event.key === 'f' || event.key === 'F') {
    if (typing) return
    void toggleFullscreen()
    return
  }
  if (event.key === 'Escape') {
    if (gallery.isOpen) gallery.close()
    else if (editing) setMode(false)
    return
  }
  if (typing) return

  if (event.key === 'l' || event.key === 'L') {
    if (gallery.isOpen) gallery.close()
    else gallery.open(receivedLooks)
    return
  }

  if (event.key === ' ') {
    event.preventDefault()
    drive.paused = !drive.paused
    return
  }
  if (event.key === 'g' || event.key === 'G') {
    tools.ghost = tools.ghost > 0 ? 0 : 0.55
    applyTools()
    panel.rebuild()
    return
  }
  if (event.key === 'h' || event.key === 'H') {
    revealEntry(4000)
    return
  }
  if (/^[1-9]$/.test(event.key)) {
    const index = Number(event.key) - 1
    if (index < store.config.layers.length) {
      select(index)
      panel.selectLayer(index)
    }
    return
  }

  // Nudging is the one thing a mouse is bad at, so keep it on the arrows.
  const nudge: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }
  const delta = nudge[event.key]
  if (delta && editing) {
    event.preventDefault()
    const step = event.shiftKey ? 1 : 0.1
    const layer = store.config.layers[selected]
    if (!layer) return
    store.set(`layers.${selected}.x`, roundTo(layer.x + delta[0] * step, 1))
    store.set(`layers.${selected}.y`, roundTo(layer.y + delta[1] * step, 1))
  }
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
  } catch {
    // Denied or unsupported — the composition still fills the window.
  }
}

/** Shows the entry bar, then hides it again once nothing has happened for `ms`. */
function revealEntry(ms: number): void {
  // In edit mode the panel is the way in, and on top of the gallery it would just be litter.
  if (editing || gallery.isOpen) {
    entry.classList.remove('visible')
    return
  }
  entry.classList.add('visible')
  clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => entry.classList.remove('visible'), ms)
}

// ── audio ──

async function syncAudio(): Promise<void> {
  const wanted = store.config.audio.enabled
  if (wanted && !drive.audio.running) {
    const ok = await drive.audio.start()
    if (!ok) {
      store.set('audio.enabled', false)
      panel.status(`Audio input unavailable: ${drive.audio.error ?? 'permission denied'}. Still running on synthetic motion.`)
      panel.refresh()
    } else {
      panel.status('Listening to audio input.')
    }
  } else if (!wanted && drive.audio.running) {
    drive.audio.stop()
    panel.status('Audio input stopped.')
  }
}

// ── export ──

async function exportVideo(): Promise<void> {
  if (exporting) return
  const config: Config = structuredClone(store.config)
  // A recording has to be reproducible, and live audio is not. Force synthetic motion.
  config.audio.enabled = false

  const fps = 30
  const seconds = config.motion.loopSeconds
  const previousWidth = canvas.width
  const previousHeight = canvas.height
  const previousPhase = drive.phase

  exporting = true
  document.body.classList.add('exporting')
  panel.setExporting(true)
  panel.status(`Recording ${seconds}s at ${config.canvas.width}×${config.canvas.height}…`)

  // Record at the design resolution exactly, whatever the window happens to be.
  canvas.width = config.canvas.width
  canvas.height = config.canvas.height

  try {
    const recording = await recordLoop({
      canvas,
      seconds,
      fps,
      render: (phase) => {
        drive.setPhase(phase)
        renderer.render(config, drive.sample(config, 1 / fps))
      },
      onProgress: (fraction, frame, total) => {
        panel.status(`Recording… frame ${frame}/${total} (${Math.round(fraction * 100)}%)`)
      },
    })

    const name = `${(config.name || 'baw').replace(/[^\w-]+/g, '-').toLowerCase()}-${config.canvas.width}x${
      config.canvas.height
    }-${seconds}s.${recording.extension}`
    const url = URL.createObjectURL(recording.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
    panel.status(`Saved ${name} — ${recording.frames} frames. See README for converting to mp4/ProRes.`)
  } catch (error) {
    panel.status(`Export failed: ${error instanceof Error ? error.message : error}`)
  } finally {
    exporting = false
    document.body.classList.remove('exporting')
    panel.setExporting(false)
    canvas.width = previousWidth
    canvas.height = previousHeight
    drive.setPhase(previousPhase)
    resize()
  }
}

// ── startup config ──

function resolveInitialConfig(): Config {
  // A link someone was sent always wins — that is the whole point of it.
  if (location.hash.startsWith('#c=')) {
    const shared = decodeConfig(location.hash.slice(3))
    if (shared) return shared
  }

  // A collection link: several looks in one URL. Open the first, offer the rest in the gallery.
  if (location.hash.startsWith('#cs=')) {
    for (const encoded of parseCollection(location.hash.slice(4))) {
      const config = decodeConfig(encoded)
      if (config) receivedLooks.push(config)
    }
    if (receivedLooks[0]) return structuredClone(receivedLooks[0])
  }

  // The generated route pages (`/1/`, `/calm/`) inject this. Someone opening /3 wants look 3,
  // not whatever they were fiddling with yesterday, so it outranks the autosave.
  const routed = (window as unknown as { __BAW_LOOK__?: string }).__BAW_LOOK__
  const wanted = routed || params.get('preset')
  if (wanted) {
    const preset = findPreset(wanted)
    if (preset) return structuredClone(preset.config)
  }

  // Nothing asked for: look 1. Deliberately *not* the last thing this browser was editing —
  // that made the shared link show whatever half-finished experiment happened to be in the
  // visitor's storage, which is confusing on the page everyone is sent to. Work in progress is
  // never lost, because the address bar is kept as a permalink of it.
  const first = publishedLooks()[0]
  return first ? structuredClone(first.config) : defaultConfig()
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
